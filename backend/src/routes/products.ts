import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { requireApprovedPartner } from './partners';
import { AppError } from '../utils/appError';
import { fail, validParams, ID_RE } from '../utils/http';
import { publicMenuItem } from '../utils/catalog';
import { deliveryEligibility, ownedAddress, text } from '../services/geography';
import { lockProducts } from '../services/inventory';
import { getSettings } from '../services/settings';
import { fromPaise, ruleFromColumns, toPaise } from '../services/pricing';

export const productsRouter = Router();
const wrap = (fn: (r: AuthenticatedRequest, s: Response) => Promise<any>) => async (r: AuthenticatedRequest, s: Response) => { try { await fn(r, s); } catch (e) {
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
  const v = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!v || !(r.user!.role === 'ADMIN' || (r.user!.role === 'VENDOR' && v.userId === r.user!.id && v.approvalStatus === 'APPROVED'))) throw new AppError(404, 'NOT_FOUND', 'Store not found.');
  return v;
};
const ownedProduct = async (r: AuthenticatedRequest) => {
  const m = await prisma.menuItem.findUnique({ where: { id: r.params.id } });
  if (!m || m.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  await owner(r, m.vendorId); return m;
};
const managedView = (m: any) => ({ ...publicMenuItem(m), barcode: m.barcode, approvalStatus: m.approvalStatus, rejectionReason: m.rejectionReason, stockQty: m.stockQty, stockVersion: m.stockVersion, lowStockThreshold: m.lowStockThreshold, lowStock: m.stockQty <= m.lowStockThreshold, vendorPricePaise: toPaise(m.vendorPrice) });
const manager = [requireAuth, requireRole('VENDOR', 'ADMIN'), requireApprovedPartner] as const;

productsRouter.get('/v1/vendors/:id/products', requireAuth, validParams('id'), wrap(async (r, s) => {
  const managing = r.user!.role === 'VENDOR' || r.user!.role === 'ADMIN';
  if (managing) await owner(r, r.params.id);
  else { if (r.user!.role !== 'STUDENT') throw new AppError(403, 'FORBIDDEN', 'Customer access required.'); await deliveryEligibility(prisma, await ownedAddress(prisma, r.user!.id, r.query.addressId), r.params.id); }
  const p = pagination(r), q = r.query.q === undefined ? '' : text(r.query.q, 'q', 80, false);
  const categoryId = r.query.categoryId === undefined ? undefined : text(r.query.categoryId, 'categoryId', 64);
  const rows = await prisma.menuItem.findMany({ ...p, where: { vendorId: r.params.id, deletedAt: null, ...(managing ? {} : { approvalStatus: 'APPROVED' }), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}), ...(categoryId ? { categoryId } : {}) } });
  s.json({ success: true, data: rows.map(managing ? managedView : publicMenuItem), nextCursor: rows.length === p.take ? rows.at(-1)!.id : null });
}));
productsRouter.get('/v1/products/:id', requireAuth, validParams('id'), wrap(async (r, s) => {
  const m = await prisma.menuItem.findFirst({ where: { id: r.params.id, deletedAt: null, approvalStatus: 'APPROVED' } });
  if (!m) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  if (r.user!.role === 'STUDENT') await deliveryEligibility(prisma, await ownedAddress(prisma, r.user!.id, r.query.addressId), m.vendorId); else await owner(r, m.vendorId);
  const variants = m.productKey ? await prisma.menuItem.findMany({ where: { vendorId: m.vendorId, productKey: m.productKey, deletedAt: null, approvalStatus: 'APPROVED' }, ...pagination(r) }) : [m];
  ok(s, { ...publicMenuItem(m), variants: variants.map(publicMenuItem), nextCursor: variants.length === pagination(r).take ? variants.at(-1)!.id : null });
}));
productsRouter.get('/v1/admin/products', requireAuth, requireRole('ADMIN'), wrap(async (r, s) => {
  const p = pagination(r), q = r.query.q === undefined ? '' : text(r.query.q, 'q', 80, false);
  const vendorId = r.query.vendorId === undefined ? undefined : text(r.query.vendorId, 'vendorId', 64);
  const cityId = r.query.cityId === undefined ? undefined : text(r.query.cityId, 'cityId', 64);
  const rows = await prisma.menuItem.findMany({ ...p, where: { deletedAt: null, ...(vendorId ? { vendorId } : {}), ...(cityId ? { vendor: { cityId } } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}), ...(r.query.lowStock === 'true' ? { stockQty: { lte: prisma.menuItem.fields.lowStockThreshold } } : {}) }, include: { vendor: { select: { id: true, name: true, cityId: true } } } });
  s.json({ success: true, data: rows.map((m) => ({ ...managedView(m), vendor: m.vendor })), nextCursor: rows.length === p.take ? rows.at(-1)!.id : null });
}));

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
  if (!Array.isArray(imageUrls) || imageUrls.length > 8 || imageUrls.some((v: unknown) => typeof v !== 'string' || v.length > 2000 || !/^https:\/\/[^\s]+$/.test(v))) throw bad('imageUrls', 'Use up to eight HTTPS image URLs that you have permission to use.');
  if (typeof b.isAvailable !== 'boolean') throw bad('isAvailable', 'Choose active or inactive.');
  const settings = await getSettings(), rule = ruleFromColumns(vendor.commissionType, vendor.commissionValue) ?? settings.commission;
  const vendorPaise = rule.type === 'FLAT' ? pricePaise - toPaise(rule.value) : Math.floor(pricePaise * 10000 / (10000 + toPaise(rule.value)));
  if (vendorPaise < 1) throw bad('pricePaise', 'Selling price must exceed the configured commission.');
  const data = { name, description, sku, productKey, unit, packSize, price: fromPaise(pricePaise), vendorPrice: fromPaise(vendorPaise), mrpPaise, categoryId, category: c.name, imageUrls, imageUrl: imageUrls[0] ?? '', isAvailable: b.isAvailable,
    barcode: text(b.barcode, 'barcode', 64, false) || null, hsnCode: text(b.hsnCode, 'hsnCode', 16, false) || null, taxRateBps: integer(b.taxRateBps ?? 0, 'taxRateBps', 0, 10000), lowStockThreshold: integer(b.lowStockThreshold ?? 5, 'lowStockThreshold') };
  return prisma.$transaction(async (tx) => {
    if (id) {
      await lockProducts(tx, [id]);
      const row = await tx.menuItem.findFirst({ where: { id, vendorId, deletedAt: null } });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
    }
    const m = id ? await tx.menuItem.update({ where: { id }, data: { ...data, ...(r.user!.role === 'VENDOR' ? { approvalStatus: 'PENDING', rejectionReason: null, reviewedAt: null, reviewedByUserId: null } : {}) } }) : await tx.menuItem.create({ data: { ...data, vendorId, approvalStatus: r.user!.role === 'ADMIN' ? 'APPROVED' : 'PENDING', createdBy: r.user!.role } });
    await tx.adminAuditLog.create({ data: { action: id ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED', targetType: 'MENU_ITEM', targetId: m.id, summary: `${r.user!.role} ${r.user!.id} saved SKU ${sku}` } });
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
    await lockProducts(tx, [item.id]);
    const replay = await tx.stockMovement.findUnique({ where: { reference } });
    if (replay) { if (replay.delta !== delta || replay.reason !== reason || replay.actorId !== r.user!.id) throw new AppError(409, 'IDEMPOTENCY_MISMATCH', 'This request ID belongs to a different stock adjustment.'); return tx.menuItem.findUniqueOrThrow({ where: { id: item.id } }); }
    const current = await tx.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    if (current.deletedAt || current.stockVersion !== expectedVersion) throw new AppError(409, 'STOCK_CHANGED', 'Stock changed. Reload before applying the adjustment.');
    if (current.stockQty + delta < 0 || current.stockQty + delta > 1000000) throw bad('delta', 'The adjustment would make available stock invalid.');
    const row = await tx.menuItem.update({ where: { id: item.id }, data: { stockQty: { increment: delta }, stockVersion: { increment: 1 } } });
    await tx.stockMovement.create({ data: { menuItemId: item.id, delta, kind: 'ADJUST', reason, actorId: r.user!.id, reference } });
    await tx.adminAuditLog.create({ data: { action: 'STOCK_ADJUSTED', targetType: 'MENU_ITEM', targetId: item.id, summary: `${r.user!.role} ${r.user!.id}: ${delta} units; ${reason}` } });
    return row;
  }); ok(s, managedView(result));
}));
