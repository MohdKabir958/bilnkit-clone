import {randomUUID} from 'crypto';
import supertest from 'supertest';
import {prisma} from '../harness/db';
import {createTestApp} from '../harness/app';
import {createWorld,purgeWorld,World} from '../harness/journey';
import {adjustOrderReservation,ensureOrderStockSafe,expireStockBatches,lockProducts,recordStockDisposition,reserveStock,settleStock} from '../../src/services/inventory';

jest.setTimeout(30000);
describe('Physical grocery stock: packing, losses, returns and FEFO lots',()=>{
 const prefix=`physical-${randomUUID().slice(0,8)}`, req=supertest(createTestApp().app);
 let w:World,itemId:string;
 const h=(token=w.vendors[0].token)=>({Authorization:`Bearer ${token}`});
 const tx=(fn:(tx:any)=>Promise<any>)=>prisma.$transaction(fn);
 const product=()=>prisma.menuItem.findUniqueOrThrow({where:{id:itemId}});
 const createOrder=async(qty:number)=>{
  const o=await prisma.order.create({data:{customerId:w.customers[0].id,vendorId:w.vendors[0].vendorId,totalAmount:qty*180,dropoffHostel:'Synthetic saved address',status:'PREPARING',paymentStatus:'PAID'}});
  await tx(async t=>{await lockProducts(t,[itemId]);await reserveStock(t,o.id,[{itemId,quantity:qty}]);});
  return o;
 };
 const disposition=async(orderId:string,action:string,quantity:number,extra:object={})=>{
  const row=await prisma.inventoryReservation.findUniqueOrThrow({where:{orderId_menuItemId:{orderId,menuItemId:itemId}}});
  return req.post(`/api/v1/inventory/reservations/${row.id}/disposition`).set(h()).send({action,quantity,reason:'Counted and inspected grocery packs',clientRequestId:randomUUID(),...extra});
 };
 const receive=async(lotCode:string,quantity:number,expiresAt:string|null=null,extra:object={})=>req.post(`/api/v1/products/${itemId}/batches`).set(h()).send({lotCode,quantity,expiresAt,expectedVersion:(await product()).stockVersion,reason:'Supplier receipt counted in store',clientRequestId:randomUUID(),...extra});
 beforeAll(async()=>{w=await createWorld(prefix,'8',{customers:1,vendors:2,riders:0});itemId=w.vendors[0].items[0].id;});
 beforeEach(async()=>{
  await prisma.order.deleteMany({where:{customerId:w.customers[0].id}});
  await prisma.stockMovement.deleteMany({where:{menuItemId:itemId}});
  await prisma.stockBatch.deleteMany({where:{menuItemId:itemId}});
  await prisma.menuItem.update({where:{id:itemId},data:{batchTracking:false,stockQty:10,stockVersion:0,approvalStatus:'APPROVED'}});
 });
 afterAll(async()=>{await purgeWorld(prefix);await prisma.$disconnect();});
 test('cancel returns only unpacked usable packs; packed units wait for explicit physical inspection',async()=>{
  const o=await createOrder(5);
  const key=randomUUID();expect((await disposition(o.id,'PACK',2,{clientRequestId:key})).status).toBe(200);
  expect((await disposition(o.id,'PACK',2,{clientRequestId:key})).status).toBe(200);
  expect((await disposition(o.id,'PACK',1,{clientRequestId:key})).body.code).toBe('IDEMPOTENCY_MISMATCH');
  expect((await disposition(o.id,'DAMAGED',1)).status).toBe(200);
  await tx(async t=>{await settleStock(t,[o],'CANCEL');await settleStock(t,[o],'CANCEL');});
  expect((await product()).stockQty).toBe(7);
  const row=await prisma.inventoryReservation.findFirstOrThrow({where:{orderId:o.id}});
  expect(row).toMatchObject({state:'AWAITING_INSPECTION',packedQty:2,unusableQty:1,pendingInspectionQty:2,releasedQty:2});
  expect((await disposition(o.id,'RETURN',1)).status).toBe(200);
  expect((await disposition(o.id,'WRITE_OFF',1)).status).toBe(200);
  expect((await product()).stockQty).toBe(8);
  expect(await prisma.inventoryReservation.findUniqueOrThrow({where:{id:row.id}})).toMatchObject({state:'RECONCILED',packedQty:0,pendingInspectionQty:0,releasedQty:3,unusableQty:2});
 });
 test('missing/damaged stock blocks fulfillment and customer-approved quantity reduction never restores losses',async()=>{
  const o=await createOrder(4);expect((await disposition(o.id,'MISSING',2)).status).toBe(200);
  await expect(tx(t=>ensureOrderStockSafe(t,[o.id]))).rejects.toMatchObject({code:'PACKING_REVIEW_REQUIRED'});
  await tx(async t=>{await lockProducts(t,[itemId]);await adjustOrderReservation(t,o.id,itemId,2,'customer-accepted-shortage');await adjustOrderReservation(t,o.id,itemId,2,'customer-accepted-shortage');await ensureOrderStockSafe(t,[o.id]);});
  expect((await product()).stockQty).toBe(6);
  expect(await prisma.inventoryReservation.findFirstOrThrow({where:{orderId:o.id}})).toMatchObject({quantity:2,unusableQty:0,state:'HELD'});
  expect(await prisma.stockMovement.count({where:{reference:`order-adjust:customer-accepted-shortage:${itemId}`}})).toBe(1);
 });
 test('packed item removal requires unpacking; rejected adjustments roll back stock and allocations',async()=>{
  const o=await createOrder(3);expect((await disposition(o.id,'PACK',3)).status).toBe(200);
  await expect(tx(t=>adjustOrderReservation(t,o.id,itemId,1,'bad-packed-removal'))).rejects.toMatchObject({code:'PACKED_STOCK_REVIEW_REQUIRED'});
  expect((await product()).stockQty).toBe(7);
  expect((await disposition(o.id,'UNPACK',2)).status).toBe(200);
  await tx(t=>adjustOrderReservation(t,o.id,itemId,1,'valid-unpacked-removal'));
  expect((await product()).stockQty).toBe(9);
 });
 test('batch tracking requires a zero count and never invents opening balances',async()=>{
  const enable=()=>req.put(`/api/v1/products/${itemId}/batch-tracking`).set(h()).send({enabled:true,reason:'Physical zero count verified'});
  expect((await enable()).body.code).toBe('STOCK_COUNT_REQUIRED');
  await prisma.menuItem.update({where:{id:itemId},data:{stockQty:0}});
  expect((await enable()).status).toBe(200);expect((await product()).stockQty).toBe(0);
  const b=await receive('LOT-A',5,new Date(Date.now()+86400000).toISOString());expect(b.status).toBe(201);
  const plain=await req.post(`/api/v1/products/${itemId}/stock`).set(h()).send({delta:5,expectedVersion:(await product()).stockVersion,reason:'Wrong generic batch adjustment',clientRequestId:randomUUID()});
  expect(plain.body.code).toBe('BATCH_REQUIRED');expect((await product()).stockQty).toBe(5);
 });
 test('FEFO takes earliest-expiring usable lot, expiry worker is idempotent and held expired units block pickup',async()=>{
  await prisma.menuItem.update({where:{id:itemId},data:{stockQty:0,batchTracking:true}});
  const later=await receive('LATER',5,new Date(Date.now()+3*86400000).toISOString());expect(later.status).toBe(201);
  const early=await receive('EARLY',2,new Date(Date.now()+86400000).toISOString());expect(early.status).toBe(201);
  const o=await createOrder(3),reservation=await prisma.inventoryReservation.findFirstOrThrow({where:{orderId:o.id}});
  expect(reservation.batchAllocations).toEqual(expect.arrayContaining([expect.objectContaining({batchId:early.body.data.id,quantity:2}),expect.objectContaining({batchId:later.body.data.id,quantity:1})]));
  expect((await product()).stockQty).toBe(4);
  const past=new Date(Date.now()-1000);
  await prisma.stockBatch.update({where:{id:later.body.data.id},data:{expiresAt:past}});
  // Expiry is snapshotted when reserving; a back-office expiry correction also updates the held allocation here as a fixture.
  await prisma.inventoryReservation.update({where:{id:reservation.id},data:{batchAllocations:(reservation.batchAllocations as any[]).map(a=>a.batchId===later.body.data.id?{...a,expiresAt:past.toISOString()}:a)}});
  await expireStockBatches();await expireStockBatches();expect((await product()).stockQty).toBe(0);
  expect(await prisma.stockMovement.count({where:{menuItemId:itemId,kind:'EXPIRED'}})).toBe(1);
  await expect(tx(t=>ensureOrderStockSafe(t,[o.id]))).rejects.toMatchObject({code:'PACKING_REVIEW_REQUIRED'});
  await tx(t=>settleStock(t,[o],'CANCEL'));expect((await product()).stockQty).toBe(2);
 });
 test('receipt replay is exact, expiry conflicts and negative corrections fail without changing stock',async()=>{
  await prisma.menuItem.update({where:{id:itemId},data:{stockQty:0,batchTracking:true}});
  const expiresAt=new Date(Date.now()+86400000).toISOString(),key=randomUUID();
  const first=await receive('LOT-REPLAY',4,expiresAt,{clientRequestId:key});expect(first.status).toBe(201);
  expect((await receive('LOT-REPLAY',4,expiresAt,{clientRequestId:key})).body.data.id).toBe(first.body.data.id);
  expect((await receive('LOT-REPLAY',5,expiresAt,{clientRequestId:key})).body.code).toBe('IDEMPOTENCY_MISMATCH');
  expect((await receive('LOT-REPLAY',1,new Date(Date.now()+2*86400000).toISOString())).body.code).toBe('BATCH_EXPIRY_MISMATCH');
  expect((await receive('EXPIRED',1,new Date(Date.now()-1000).toISOString())).status).toBe(400);
  const fix=await req.post(`/api/v1/products/${itemId}/batches/${first.body.data.id}/stock`).set(h()).send({delta:-5,expectedVersion:(await product()).stockVersion,reason:'Remove broken and counted packs',clientRequestId:randomUUID()});expect(fix.status).toBe(400);
  expect((await product()).stockQty).toBe(4);
 });
 test('cross-store/customer access and invalid physical counts fail closed; barcode lookup is server-side',async()=>{
  const o=await createOrder(1),row=await prisma.inventoryReservation.findFirstOrThrow({where:{orderId:o.id}});
  for(const path of [`/api/v1/products/${itemId}/batches`,`/api/v1/products/${itemId}/reservations`])expect((await req.get(path).set(h(w.vendors[1].token))).status).toBe(404);
  expect((await req.post(`/api/v1/inventory/reservations/${row.id}/disposition`).set(h(w.vendors[1].token)).send({action:'PACK',quantity:1,reason:'Unauthorized store action',clientRequestId:randomUUID()})).status).toBe(404);
  expect((await req.post(`/api/v1/inventory/reservations/${row.id}/disposition`).set(h(w.customers[0].token)).send({action:'PACK',quantity:1,reason:'Customer cannot pack stock',clientRequestId:randomUUID()})).status).toBe(403);
  expect((await disposition(o.id,'PACK',0)).status).toBe(400);
  await prisma.menuItem.update({where:{id:itemId},data:{barcode:'8900000012345'}});
  const search=await req.get(`/api/v1/vendors/${w.vendors[0].vendorId}/products?q=8900000012345`).set(h());expect(search.status).toBe(200);expect(search.body.data.map((p:any)=>p.id)).toEqual([itemId]);
 });
});
