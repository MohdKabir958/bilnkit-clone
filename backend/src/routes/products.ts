import {openCatalogAssistance,bindCatalogAssistance,checkAssistanceStore,auditCatalogAssistance} from '../services/catalogAssistance';
import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { requireApprovedPartner } from './partners';
import { AppError } from '../utils/appError';
import { fail, validParams, ID_RE } from '../utils/http';
import { publicMenuItem } from '../utils/catalog';
import { deliveryEligibility, ownedAddress, text } from '../services/geography';
import { batchAvailability, dispositionActions, lockProducts, recordStockDisposition } from '../services/inventory';
import { getSettings } from '../services/settings';
import { fromPaise, ruleFromColumns, toPaise } from '../services/pricing';

export const productsRouter = Router();
const wrap = (fn: (r: AuthenticatedRequest, s: Response) => Promise<any>) => async (r: AuthenticatedRequest, s: Response) => { try { await bindCatalogAssistance(r);await fn(r, s); } catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(s, new AppError(409, 'ALREADY_EXISTS', 'This SKU or request already exists.'), 'products');
  fail(s, e, 'products');
} };
const ok = (s: Response, data: unknown, status = 200) => s.status(status).json({ success: true, data });
const bad = (f: string, m: string) => new AppError(400, 'BAD_PRODUCT', m, f);
const integer = (n: unknown, f: string, min = 0, max = 1000000) => { if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max) throw bad(f, `Enter an integer ${f} between ${min} and ${max}.`); return n; };
const pagination = (r: AuthenticatedRequest) => {
  const take = r.query.limit === undefined ? 50 : Number(r.query.limit);
  if (!Number.isInteger(take) || take < 1 || take > 100) throw bad('limit', 'Page size must be 1–100.');
  const after = r.query.after;
  if (after !== undefined && (typeof after !== 'string' || !ID_RE.test(after))) throw bad('after', 'Invalid cursor.');
  return { take, ...(after ? { cursor: { id: after as string }, skip: 1 } : {}), orderBy: { id: 'asc' as const } };
};
const owner = async (r: AuthenticatedRequest, vendorId: string) => {
  checkAssistanceStore(r,vendorId);
  const v = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!v || !(r.user!.role === 'ADMIN' || (r.user!.role === 'VENDOR' && v.userId === r.user!.id && v.approvalStatus === 'APPROVED'))) throw new AppError(404, 'NOT_FOUND', 'Store not found.');
  return v;
};
// Recheck ownership under a store row lock before a stock write. This also
// serializes with reassignment/suspension without holding a connection over I/O.
async function lockInventoryOwner(tx: Prisma.TransactionClient,r:AuthenticatedRequest,vendorId:string) {
  const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT "id" FROM "Vendor" WHERE "id"=${vendorId} ${r.user!.role==='ADMIN'?Prisma.empty:Prisma.sql`AND "userId"=${r.user!.id} AND "approvalStatus"='APPROVED'`} FOR SHARE`);
  if(!rows.length)throw new AppError(404,'NOT_FOUND','Store not found.');
}
const ownedProduct = async (r: AuthenticatedRequest) => {
  const m = await prisma.menuItem.findUnique({ where: { id: r.params.id } });
  if (!m || m.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  await owner(r, m.vendorId); return m;
};
const managedView = (m: any) => ({ ...publicMenuItem(m), batchTracking: m.batchTracking ?? false, barcode: m.barcode, approvalStatus: m.approvalStatus, rejectionReason: m.rejectionReason, stockQty: m.stockQty, stockVersion: m.stockVersion, lowStockThreshold: m.lowStockThreshold, lowStock: m.stockQty <= m.lowStockThreshold, vendorPricePaise: toPaise(m.vendorPrice) });

/** Display usable packs, excluding expired lots, even before the expiry worker's next pass. */
async function productViews(rows: any[], managing: boolean) {
  const counts = await batchAvailability(rows.filter((m) => m.batchTracking).map((m) => m.id));
  return rows.map((m) => {
    const batches = counts.get(m.id) ?? {availableQty:0,expiredQty:0,expiringQty:0,nextExpiry:null};
    const projected = m.batchTracking ? {...m, stockQty: Math.min(m.stockQty, batches.availableQty)} : m;
    return managing ? {...managedView(projected), countedStockQty:m.stockQty, ...(m.batchTracking ? {batchSummary:batches} : {})} : publicMenuItem(projected);
  });
}

productsRouter.post('/v1/admin/catalog/assistance',requireAuth,requireRole('ADMIN'),wrap(async(r,s)=>ok(s,await openCatalogAssistance(r.user!.id,r.body??{}),201)));

const manager = [requireAuth, requireRole('VENDOR', 'ADMIN'), requireApprovedPartner] as const;

productsRouter.get('/v1/vendors/:id/products', requireAuth, validParams('id'), wrap(async (r, s) => {
  const managing = r.user!.role === 'VENDOR' || r.user!.role === 'ADMIN';
  if (managing) await owner(r, r.params.id);
  else { if (r.user!.role !== 'STUDENT') throw new AppError(403, 'FORBIDDEN', 'Customer access required.'); await deliveryEligibility(prisma, await ownedAddress(prisma, r.user!.id, r.query.addressId), r.params.id); }
  const p = pagination(r), q = r.query.q === undefined ? '' : text(r.query.q, 'q', 80, false);
  const categoryId = r.query.categoryId === undefined ? undefined : text(r.query.categoryId, 'categoryId', 64);
  const rows = await prisma.menuItem.findMany({ ...p, where: { vendorId: r.params.id, deletedAt: null, ...(managing ? {} : { approvalStatus: 'APPROVED' }), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } : {}), ...(categoryId ? { categoryId } : {}) } });
  s.json({ success: true, data: await productViews(rows, managing), nextCursor: rows.length === p.take ? rows.at(-1)!.id : null });
}));
productsRouter.get('/v1/products/:id', requireAuth, validParams('id'), wrap(async (r, s) => {
  const m = await prisma.menuItem.findFirst({ where: { id: r.params.id, deletedAt: null, approvalStatus: 'APPROVED' } });
  if (!m) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  if (r.user!.role === 'STUDENT') await deliveryEligibility(prisma, await ownedAddress(prisma, r.user!.id, r.query.addressId), m.vendorId); else await owner(r, m.vendorId);
  const variants = m.productKey ? await prisma.menuItem.findMany({ where: { vendorId: m.vendorId, productKey: m.productKey, deletedAt: null, approvalStatus: 'APPROVED' }, ...pagination(r) }) : [m];
  ok(s, { ...(await productViews([m], false))[0], variants: await productViews(variants, false), nextCursor: variants.length === pagination(r).take ? variants.at(-1)!.id : null });
}));
productsRouter.get('/v1/admin/products', requireAuth, requireRole('ADMIN'), wrap(async (r, s) => {
  const p = pagination(r), q = r.query.q === undefined ? '' : text(r.query.q, 'q', 80, false);
  const vendorId = r.query.vendorId === undefined ? undefined : text(r.query.vendorId, 'vendorId', 64);
  const cityId = r.query.cityId === undefined ? undefined : text(r.query.cityId, 'cityId', 64);
  const rows = await prisma.menuItem.findMany({ ...p, where: { deletedAt: null, ...(vendorId ? { vendorId } : {}), ...(cityId ? { vendor: { cityId } } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } : {}), ...(r.query.lowStock === 'true' ? { stockQty: { lte: prisma.menuItem.fields.lowStockThreshold } } : {}) }, include: { vendor: { select: { id: true, name: true, cityId: true } } } });
  s.json({ success: true, data: (await productViews(rows, true)).map((m, i) => ({ ...m, vendor: rows[i].vendor })), nextCursor: rows.length === p.take ? rows.at(-1)!.id : null });
}));

/** Local image uploads may use the explicitly configured development origin. */
function productImageUrl(value:unknown) {
  if(typeof value!=='string'||value.length>2000) return false;
  try {
    const u=new URL(value);
    if(u.username||u.password||/\s/.test(value))return false;
    if(u.protocol==='https:')return true;
    const base=new URL(process.env.PUBLIC_BASE_URL||'http://localhost:5000');
    return process.env.NODE_ENV!=='production'&&u.protocol==='http:'&&u.origin===base.origin&&/^\/uploads\/dish\/\d{4}\/[0-9a-f]{32}\.(jpg|png|webp)$/.test(u.pathname)&&!u.search&&!u.hash;
  }catch{return false;}
}

async function writeProduct(r: AuthenticatedRequest, vendorId: string, id?: string) {
  const vendor = await owner(r, vendorId), b = r.body ?? {};
  const name = text(b.name, 'name', 100), description = text(b.description, 'description', 2000, false);
  const sku = text(b.sku, 'sku', 64).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.-]*$/.test(sku)) throw bad('sku', 'Use letters, digits, dot, underscore or hyphen in the SKU.');
  const productKey = text(b.productKey, 'productKey', 80);
  const unit = text(b.unit, 'unit', 8), packSize = text(b.packSize, 'packSize', 20);
  if (!['g','kg','ml','l','pcs','pack'].includes(unit) || !/^\d+(\.\d{1,3})?$/.test(packSize) || Number(packSize) <= 0) throw bad('packSize', 'Choose a valid unit and positive pack quantity.');
  const pricePaise = integer(b.pricePaise, 'pricePaise', 1), mrpPaise = b.mrpPaise == null ? null : integer(b.mrpPaise, 'mrpPaise', pricePaise);
  const categoryId = text(b.categoryId, 'categoryId', 64);
  const c = await prisma.category.findFirst({ where: { id: categoryId, isActive: true, forDishes: true } });
  if (!c) throw bad('categoryId', 'Choose an active product category.');
  const imageUrls = b.imageUrls ?? [];
  if (!Array.isArray(imageUrls) || imageUrls.length > 8 || imageUrls.some((v: unknown) => !productImageUrl(v))) throw bad('imageUrls', 'Use up to eight HTTPS image URLs that you have permission to use.');
  if (typeof b.isAvailable !== 'boolean') throw bad('isAvailable', 'Choose active or inactive.');
  const settings = await getSettings(), rule = ruleFromColumns(vendor.commissionType, vendor.commissionValue) ?? settings.commission;
  const vendorPaise = rule.type === 'FLAT' ? pricePaise - toPaise(rule.value) : Math.floor(pricePaise * 10000 / (10000 + toPaise(rule.value)));
  if (vendorPaise < 1) throw bad('pricePaise', 'Selling price must exceed the configured commission.');
  const data = { name, description, sku, productKey, unit, packSize, price: fromPaise(pricePaise), vendorPrice: fromPaise(vendorPaise), mrpPaise, categoryId, category: c.name, imageUrls, imageUrl: imageUrls[0] ?? '', isAvailable: b.isAvailable,
    barcode: text(b.barcode, 'barcode', 64, false) || null, hsnCode: text(b.hsnCode, 'hsnCode', 16, false) || null, taxRateBps: integer(b.taxRateBps ?? 0, 'taxRateBps', 0, 10000), lowStockThreshold: integer(b.lowStockThreshold ?? 5, 'lowStockThreshold') };
  return prisma.$transaction(async (tx) => {
    await lockInventoryOwner(tx,r,vendorId);
    if (id) {
      await lockProducts(tx, [id]);
      const row = await tx.menuItem.findFirst({ where: { id, vendorId, deletedAt: null } });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
    }
    const m = id ? await tx.menuItem.update({ where: { id }, data: { ...data, ...(r.user!.role === 'VENDOR' ? { approvalStatus: 'PENDING', rejectionReason: null, reviewedAt: null, reviewedByUserId: null } : {}) } }) : await tx.menuItem.create({ data: { ...data, vendorId, approvalStatus: r.user!.role === 'ADMIN' ? 'APPROVED' : 'PENDING', createdBy: r.user!.role } });
    await tx.adminAuditLog.create({ data: { action: id ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED', targetType: 'MENU_ITEM', targetId: m.id, summary: `${r.user!.role} ${r.user!.id} saved SKU ${sku}` } });
    await auditCatalogAssistance(tx,r,m.id);
    return managedView(m);
  });
}
productsRouter.post('/v1/vendors/:id/products', ...manager, validParams('id'), wrap(async (r, s) => ok(s, await writeProduct(r, r.params.id), 201)));
productsRouter.put('/v1/products/:id', ...manager, validParams('id'), wrap(async (r, s) => { const m = await ownedProduct(r); ok(s, await writeProduct(r, m.vendorId, m.id)); }));
productsRouter.delete('/v1/products/:id', ...manager, validParams('id'), wrap(async (r, s) => {
  const m = await ownedProduct(r);
  await prisma.$transaction(async (tx) => { await lockProducts(tx, [m.id]); await tx.menuItem.update({ where: { id: m.id }, data: { deletedAt: new Date(), isAvailable: false } }); await tx.adminAuditLog.create({ data: { action: 'PRODUCT_ARCHIVED', targetType: 'MENU_ITEM', targetId: m.id, summary: `Archived by ${r.user!.id}` } }); });
  ok(s, { deleted: true });
}));
productsRouter.get('/v1/products/:id/stock-movements', ...manager, validParams('id'), wrap(async (r, s) => {
  await ownedProduct(r); const p = pagination(r); const rows = await prisma.stockMovement.findMany({ ...p, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { menuItemId: r.params.id } });
  s.json({ success: true, data: rows, nextCursor: rows.length === p.take ? rows.at(-1)!.id : null });
}));
productsRouter.post('/v1/products/:id/stock', ...manager, validParams('id'), wrap(async (r, s) => {
  const item = await ownedProduct(r), b = r.body ?? {}, reason = text(b.reason, 'reason', 200), key = text(b.clientRequestId, 'clientRequestId', 64);
  if (!ID_RE.test(key)) throw bad('clientRequestId', 'Use a unique request ID for this adjustment.');
  const delta = integer(b.delta, 'delta', -1000000), reference = `adjust:${item.id}:${key}`;
  const expectedVersion = integer(b.expectedVersion, 'expectedVersion', 0, 2147483646);
  const result = await prisma.$transaction(async (tx) => {
    await lockInventoryOwner(tx,r,item.vendorId);
    await lockProducts(tx, [item.id]);
    const replay = await tx.stockMovement.findUnique({ where: { reference } });
    if (replay) { if (replay.delta !== delta || replay.reason !== reason || replay.actorId !== r.user!.id) throw new AppError(409, 'IDEMPOTENCY_MISMATCH', 'This request ID belongs to a different stock adjustment.'); return tx.menuItem.findUniqueOrThrow({ where: { id: item.id } }); }
    const current = await tx.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    if (current.batchTracking) throw new AppError(409, 'BATCH_REQUIRED', 'This product tracks lots. Receive or correct the specific batch instead.');
    if (current.deletedAt || current.stockVersion !== expectedVersion) throw new AppError(409, 'STOCK_CHANGED', 'Stock changed. Reload before applying the adjustment.');
    if (current.stockQty + delta < 0 || current.stockQty + delta > 1000000) throw bad('delta', 'The adjustment would make available stock invalid.');
    const row = await tx.menuItem.update({ where: { id: item.id }, data: { stockQty: { increment: delta }, stockVersion: { increment: 1 } } });
    await tx.stockMovement.create({ data: { menuItemId: item.id, delta, kind: 'ADJUST', reason, actorId: r.user!.id, reference } });
    await tx.adminAuditLog.create({ data: { action: 'STOCK_ADJUSTED', targetType: 'MENU_ITEM', targetId: item.id, summary: `${r.user!.role} ${r.user!.id}: ${delta} units; ${reason}` } });
    await auditCatalogAssistance(tx,r,item.id);
    return row;
  }); ok(s, managedView(result));
}));

// Physical packing and returns are separate from available shelf stock.
productsRouter.get('/v1/products/:id/reservations', ...manager, validParams('id'), wrap(async (r, s) => {
  await ownedProduct(r);
  const rows = await prisma.inventoryReservation.findMany({where:{menuItemId:r.params.id,state:{in:['HELD','AWAITING_INSPECTION']},order:{OR:[{paymentStatus:'PAID'},{paymentMethod:'COD'}]}},take:100,orderBy:[{updatedAt:'desc'},{id:'asc'}],include:{order:{select:{id:true,status:true,createdAt:true}}}});
  ok(s, rows);
}));
productsRouter.post('/v1/inventory/reservations/:id/disposition', ...manager, validParams('id'), wrap(async (r,s) => {
  const b=r.body??{}, action=b.action;
  if(!dispositionActions.includes(action)) throw bad('action','Choose packing, shortage or return inspection action.');
  const quantity=integer(b.quantity,'quantity',1), reason=text(b.reason,'reason',200), clientRequestId=text(b.clientRequestId,'clientRequestId',64);
  if(reason.length<5||!ID_RE.test(clientRequestId))throw bad('reason','Enter a useful stock reason and unique request ID.');
  const seed=await prisma.inventoryReservation.findUnique({where:{id:r.params.id},include:{item:{select:{vendorId:true}}}});
  if(!seed)throw new AppError(404,'NOT_FOUND','Packing record not found.');
  await owner(r,seed.item.vendorId);
  const result=await prisma.$transaction(async tx=>{
    // Store, then order, then sorted SKU: same order as checkout.
    await lockInventoryOwner(tx,r,seed.item.vendorId);
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${seed.orderId} FOR UPDATE`;
    await lockProducts(tx,[seed.menuItemId]);
    const v=await tx.vendor.findUnique({where:{id:seed.item.vendorId},select:{userId:true,approvalStatus:true}});
    if(!v||r.user!.role!=='ADMIN'&&(v.userId!==r.user!.id||v.approvalStatus!=='APPROVED'))throw new AppError(404,'NOT_FOUND','Store not found.');
    const order=await tx.order.findUniqueOrThrow({where:{id:seed.orderId},select:{status:true,paymentStatus:true,paymentMethod:true}});
    if(order.status!=='CANCELLED'&&(!['ACCEPTED','PREPARING','READY_FOR_PICKUP'].includes(order.status)||order.paymentStatus!=='PAID'&&order.paymentMethod!=='COD'))throw new AppError(409,'PACKING_NOT_STARTED','Accept a confirmed order before recording its physical packing.');
    if(['PICKED_UP','ARRIVED_AT_GATE','DELIVERED'].includes(order.status))throw new AppError(409,'PACKING_FINISHED','Stock is already with the delivery partner. Contact support for a post-delivery issue.');
    const outcome=await recordStockDisposition(tx,seed.id,{action,quantity,reason,clientRequestId,actorId:r.user!.id,...(b.batchId?{batchId:text(b.batchId,'batchId',64)}:{})});
    await auditCatalogAssistance(tx,r,seed.menuItemId);return outcome;
  });ok(s,result);
}));
productsRouter.get('/v1/products/:id/batches', ...manager, validParams('id'), wrap(async (r,s)=>{
  const item=await ownedProduct(r), p=pagination(r);
  const rows=await prisma.stockBatch.findMany({...p,where:{menuItemId:item.id}});
  s.json({success:true,data:rows,batchTracking:item.batchTracking,stockVersion:item.stockVersion,nextCursor:rows.length===p.take?rows.at(-1)!.id:null});
}));
productsRouter.put('/v1/products/:id/batch-tracking', ...manager, validParams('id'), wrap(async (r,s)=>{
  const item=await ownedProduct(r),b=r.body??{},reason=text(b.reason,'reason',200);
  if(typeof b.enabled!=='boolean'||reason.length<5)throw bad('enabled','Choose tracking and explain the stock count.');
  const result=await prisma.$transaction(async tx=>{
    await lockInventoryOwner(tx,r,item.vendorId);
    await lockProducts(tx,[item.id]);const current=await tx.menuItem.findUniqueOrThrow({where:{id:item.id}});
    if(current.batchTracking===b.enabled)return current;
    const held=await tx.inventoryReservation.count({where:{menuItemId:item.id,state:{in:['HELD','AWAITING_INSPECTION']}}});
    const available=await tx.stockBatch.aggregate({where:{menuItemId:item.id},_sum:{availableQty:true}});
    if(current.stockQty!==0||held||available._sum.availableQty)throw new AppError(409,'STOCK_COUNT_REQUIRED','Reconcile shelf stock and active reservations to zero before changing batch tracking. Then receive each counted lot.');
    const result=await tx.menuItem.update({where:{id:item.id},data:{batchTracking:b.enabled,stockVersion:{increment:1}}});
    await tx.adminAuditLog.create({data:{action:'BATCH_TRACKING_CHANGED',targetType:'MENU_ITEM',targetId:item.id,summary:`${r.user!.id}: tracking ${b.enabled}; ${reason}`}});await auditCatalogAssistance(tx,r,item.id);return result;
  });ok(s,managedView(result));
}));
productsRouter.post('/v1/products/:id/batches', ...manager, validParams('id'), wrap(async(r,s)=>{
  const item=await ownedProduct(r),b=r.body??{},quantity=integer(b.quantity,'quantity',1),lotCode=text(b.lotCode,'lotCode',80),reason=text(b.reason,'reason',200),key=text(b.clientRequestId,'clientRequestId',64),expectedVersion=integer(b.expectedVersion,'expectedVersion',0,2147483646);
  if(!ID_RE.test(key)||reason.length<5)throw bad('reason','Enter a useful receipt reason and unique request ID.');
  const expiresAt=b.expiresAt==null||b.expiresAt===''?null:new Date(b.expiresAt);
  if(expiresAt&&(!/^\d{4}-\d{2}-\d{2}T/.test(b.expiresAt)||!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now()))throw bad('expiresAt','Choose a future expiry timestamp, or omit it for a non-perishable batch.');
  const reference=`batch-receive:${item.id}:${key}`;
  const result=await prisma.$transaction(async tx=>{
    await lockInventoryOwner(tx,r,item.vendorId);
    await lockProducts(tx,[item.id]);
    const replay=await tx.stockMovement.findUnique({where:{reference}});
    if(replay){const d=replay.details as any;if(replay.actorId!==r.user!.id||replay.delta!==quantity||replay.reason!==reason||d?.lotCode!==lotCode||d?.expiresAt!==(expiresAt?.toISOString()??null))throw new AppError(409,'IDEMPOTENCY_MISMATCH','This receipt reference belongs to a different batch.');return tx.stockBatch.findUniqueOrThrow({where:{id:d.batchId}});}
    const current=await tx.menuItem.findUniqueOrThrow({where:{id:item.id}});
    if(current.deletedAt)throw new AppError(404,'NOT_FOUND','Product not found.');
    if(!current.batchTracking)throw new AppError(409,'BATCH_TRACKING_DISABLED','Enable lot tracking after reconciling shelf stock to zero.');
    if(current.stockVersion!==expectedVersion)throw new AppError(409,'STOCK_CHANGED','Stock changed. Reload before receiving this batch.');
    if(current.stockQty+quantity>1000000)throw bad('quantity','The received count exceeds the supported stock limit.');
    const old=await tx.stockBatch.findUnique({where:{menuItemId_lotCode:{menuItemId:item.id,lotCode}}});
    if(old&&old.expiresAt?.toISOString()!==(expiresAt?.toISOString()))throw new AppError(409,'BATCH_EXPIRY_MISMATCH','A lot code must keep its recorded expiry. Use the correct lot or a new one.');
    const batch=await tx.stockBatch.upsert({where:{menuItemId_lotCode:{menuItemId:item.id,lotCode}},create:{menuItemId:item.id,lotCode,availableQty:quantity,expiresAt},update:{availableQty:{increment:quantity}}});
    await tx.menuItem.update({where:{id:item.id},data:{stockQty:{increment:quantity},stockVersion:{increment:1}}});
    await tx.stockMovement.create({data:{menuItemId:item.id,delta:quantity,kind:'BATCH_RECEIVED',reason,actorId:r.user!.id,reference,details:{batchId:batch.id,lotCode,expiresAt:expiresAt?.toISOString()??null}}});
    await auditCatalogAssistance(tx,r,item.id);
    return batch;
  });ok(s,result,201);
}));
productsRouter.post('/v1/products/:id/batches/:batchId/stock', ...manager, validParams('id','batchId'), wrap(async(r,s)=>{
  const item=await ownedProduct(r),b=r.body??{},delta=integer(b.delta,'delta',-1000000),expectedVersion=integer(b.expectedVersion,'expectedVersion',0,2147483646),reason=text(b.reason,'reason',200),key=text(b.clientRequestId,'clientRequestId',64);
  if(!delta||!ID_RE.test(key)||reason.length<5)throw bad('reason','Enter a non-zero correction, a useful reason and a unique request ID.');
  const reference=`batch-correct:${item.id}:${key}`;
  const result=await prisma.$transaction(async tx=>{
    await lockInventoryOwner(tx,r,item.vendorId);
    await lockProducts(tx,[item.id]);const replay=await tx.stockMovement.findUnique({where:{reference}});
    if(replay){if(replay.actorId!==r.user!.id||replay.delta!==delta||replay.reason!==reason||(replay.details as any)?.batchId!==r.params.batchId)throw new AppError(409,'IDEMPOTENCY_MISMATCH','This correction reference has already been used.');return tx.stockBatch.findUniqueOrThrow({where:{id:r.params.batchId}});}
    const current=await tx.menuItem.findUniqueOrThrow({where:{id:item.id}}),batch=await tx.stockBatch.findFirst({where:{id:r.params.batchId,menuItemId:item.id}});
    if(!batch)throw new AppError(404,'NOT_FOUND','Batch not found.');
    if(!current.batchTracking||current.stockVersion!==expectedVersion)throw new AppError(409,'STOCK_CHANGED','Stock changed. Reload before correcting this lot.');
    if(delta>0&&batch.expiresAt&&batch.expiresAt.getTime()<=Date.now())throw new AppError(409,'EXPIRED_STOCK','Expired lots cannot return to sale.');
    if(batch.availableQty+delta<0||current.stockQty+delta<0||current.stockQty+delta>1000000)throw bad('delta','This correction would make the available stock invalid.');
    const result=await tx.stockBatch.update({where:{id:batch.id},data:{availableQty:{increment:delta}}});
    await tx.menuItem.update({where:{id:item.id},data:{stockQty:{increment:delta},stockVersion:{increment:1}}});
    await tx.stockMovement.create({data:{menuItemId:item.id,delta,kind:delta<0?'BATCH_WRITE_OFF':'BATCH_CORRECTION',reason,actorId:r.user!.id,reference,details:{batchId:batch.id,lotCode:batch.lotCode}}});await auditCatalogAssistance(tx,r,item.id);return result;
  });ok(s,result);
}));
