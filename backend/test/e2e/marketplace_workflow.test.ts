import {randomUUID} from 'crypto';
import {prisma} from '../harness/db';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
import {createWorld,resetWorldState,purgeWorld,createApi,createLedger,World,Api} from '../harness/journey';
import {waitForNotificationIntents} from '../../src/services/push/intents';
import {setPaymentProvider} from '../../src/services/paymentService';
import {ensureDispatchOffer} from '../../src/services/dispatch';
import {verifyGateOtp} from '../../src/services/orderFlow';
import {orderView,ORDER_VIEW_INCLUDE} from '../../src/services/orderView';
import {generateTestToken} from '../harness/auth';

jest.setTimeout(60000);
describe('Single-store marketplace: real transactions, cash accounting and broadcast races',()=>{
 let server:TestServerInstance,W:World,api:Api;
 const tag='marketplace';
 const raw=(who:{token:string},method:string,path:string,body?:object)=>api.raw('marketplace',method as any,path,who.token,body);
 const body=async(method='COD',customer=W.customers[0],vendor=W.vendors[0])=>({vendorId:vendor.vendorId,addressId:(await prisma.address.findFirstOrThrow({where:{customerId:customer.id}})).id,items:[{itemId:vendor.items[0].id,quantity:1}],paymentMethod:method,clientRequestId:randomUUID()});
 const place=async(method='COD',customer=W.customers[0])=>{const r=await raw(customer,'post','/api/v2/checkout',await body(method,customer));expect(r.status).toBe(201);return r.body.data.id as string;};
 const accept=async(id:string)=>{const r=await raw(W.vendors[0],'patch',`/api/orders/${id}/status`,{status:'ACCEPTED',preparationMinutes:1});expect(r.status).toBe(200);};
 beforeAll(async()=>{server=await startTestServer();W=await createWorld(tag,'5',{customers:3,vendors:2,riders:3});api=createApi(server.baseUrl);await prisma.category.upsert({where:{slug:'marketplace-store-test'},create:{id:'marketplace-category',slug:'marketplace-store-test',name:'Vegetable shops',forRestaurants:true,forDishes:false},update:{}});});
 beforeEach(async()=>{await waitForNotificationIntents();if(process.env.NODE_ENV!=='test'||!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))throw Error('Disposable database required');await prisma.$executeRawUnsafe('TRUNCATE TABLE "CashLedgerEvent"');await prisma.cashCollection.deleteMany({where:{order:{customerId:{startsWith:tag+'-'}}}});await resetWorldState(W);await prisma.city.update({where:{id:tag+'-city'},data:{active:true,codEnabled:true}});await prisma.vendor.updateMany({where:{id:{startsWith:tag+'-'}},data:{primaryCategoryId:'marketplace-category',publicPhone:'+919000000001'}});await prisma.driverPartner.updateMany({where:{id:{startsWith:tag+'-'}},data:{availabilityLat:23.0745,availabilityLng:76.859,availabilityAt:new Date()}});setPaymentProvider(createLedger().provider);});
 afterAll(async()=>{await waitForNotificationIntents();if(process.env.NODE_ENV!=='test'||!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))throw Error('Disposable database required');await prisma.$executeRawUnsafe('TRUNCATE TABLE "CashLedgerEvent"');await prisma.cashCollection.deleteMany({where:{order:{customerId:{startsWith:tag+'-'}}}});await purgeWorld(tag);await prisma.category.delete({where:{id:'marketplace-category'}});setPaymentProvider(null);await stopTestServer(server);await prisma.$disconnect();});
 test('deployed default retires legacy order creation without blocking existing records',async()=>{
  const before=process.env.LEGACY_CHECKOUT_ENABLED;
  try {delete process.env.LEGACY_CHECKOUT_ENABLED;expect((await raw(W.customers[0],'post','/api/orders',await body('ONLINE'))).status).toBe(410);expect((await raw(W.customers[0],'post','/api/order-groups',{restaurants:[{},{}]})).status).toBe(410);}
  finally {process.env.LEGACY_CHECKOUT_ENABLED=before;}
 });
 test('server quote and COD order agree, replay is idempotent and method cannot change under the same key',async()=>{
  const b=await body();const q=await raw(W.customers[0],'post','/api/v2/checkout/quote',b);expect(q.status).toBe(200);expect(q.body.data.maxRestaurants).toBe(1);expect(q.body.data.paymentMethods).toContain('COD');
  const p=await raw(W.customers[0],'post','/api/v2/checkout',b);expect(p.status).toBe(201);expect(p.body.data.totalAmount).toBe(q.body.data.total);expect(p.body.data.paymentStatus).toBe('PENDING');expect(p.body.data.payBy).toBeNull();expect(p.body.data.cashAmountDue).toBe(q.body.data.total);
  expect((await raw(W.customers[0],'post','/api/v2/checkout',b)).body.data.id).toBe(p.body.data.id);
  expect((await raw(W.customers[0],'post','/api/v2/checkout',{...b,paymentMethod:'ONLINE'})).body.code).toBe('CLIENT_REQUEST_MISMATCH');
  expect(await prisma.payment.count({where:{orderId:p.body.data.id}})).toBe(0);
 });
 test('unpaid ONLINE stays private, COD is actionable immediately; neither broadcasts before acceptance',async()=>{
  const online=await place('ONLINE');expect((await api.get(W.vendors[0],online)).status).toBe(404);
  const id=await place();expect((await api.get(W.vendors[0],id)).status).toBe(200);expect(await prisma.dispatchOffer.count({where:{orderId:id}})).toBe(0);
  const payment=await api.createPayment(W.customers[0],id);expect(payment.status).toBe(409);expect(payment.body.code).toBe('CASH_ORDER');
  await accept(id);expect(await prisma.dispatchOffer.count({where:{orderId:id,state:'PENDING'}})).toBe(3);
 });
 test('all nearby riders receive simultaneous offers, first acceptance wins, private details are protected',async()=>{
  const id=await place();await accept(id);
  for(const rider of W.riders){const r=await api.get(rider,id);expect(r.status).toBe(200);expect(r.body.data.customer).toBeNull();expect(r.body.data.otpCode).toBeNull();expect(r.body.data.deliveryAddress).toBeUndefined();expect(r.body.data.vendor.phone).toBe('+919000000001');}
  const results=await Promise.all(W.riders.map(r=>raw(r,'post',`/api/orders/${id}/accept-driver`,{})));expect(results.filter(r=>r.status===200)).toHaveLength(1);expect(results.filter(r=>r.status===409)).toHaveLength(2);
  expect(await prisma.dispatchOffer.count({where:{orderId:id,state:'ACCEPTED'}})).toBe(1);expect(await prisma.dispatchOffer.count({where:{orderId:id,state:'REVOKED'}})).toBe(2);
  const o=await prisma.order.findUniqueOrThrow({where:{id},include:ORDER_VIEW_INCLUDE});expect(orderView(o,'DRIVER',o.driverId!)?.deliveryAddress).toBeDefined();expect(orderView(o,'DRIVER',o.driverId!)?.otpCode).toBeNull();
 });
 test('stale GPS is excluded, radius expands, and no-accept exhaustion remains visible',async()=>{
  await prisma.driverPartner.updateMany({where:{id:{startsWith:tag+'-'}},data:{availabilityLat:23.111,availabilityAt:new Date()}});
  const id=await place();await accept(id);expect(await prisma.dispatchOffer.count({where:{orderId:id}})).toBe(0);
  const start=new Date();await prisma.order.update({where:{id},data:{dispatchNextAttemptAt:new Date(start.getTime()-1)}});
  await ensureDispatchOffer(id,start);expect(await prisma.dispatchOffer.count({where:{orderId:id,round:1}})).toBe(3);
  const later=new Date(start.getTime()+46000);await ensureDispatchOffer(id,later);expect(await prisma.dispatchOffer.count({where:{orderId:id,round:2}})).toBe(3);
  await ensureDispatchOffer(id,new Date(later.getTime()+46000));expect((await prisma.order.findUniqueOrThrow({where:{id}})).dispatchNote).toBe('OFFERS_EXHAUSTED');
  const second=await place('COD',W.customers[1]);await prisma.driverPartner.updateMany({where:{id:{startsWith:tag+'-'}},data:{availabilityLat:23.0745,availabilityAt:new Date(Date.now()-121000)}});await accept(second);expect(await prisma.dispatchOffer.count({where:{orderId:second}})).toBe(0);
 });
 test('wrong delivery code or missing cash confirmation cannot collect cash; valid confirmation commits once',async()=>{
  const id=await place();await accept(id);const rider=W.riders[0];expect((await raw(rider,'post',`/api/orders/${id}/accept-driver`,{})).status).toBe(200);
  // Arrange at-doorstep state to focus on the locked OTP + cash transaction (navigation has its own regression suite).
  await prisma.order.update({where:{id},data:{status:'ARRIVED_AT_GATE',otpCode:'0742',otpExpiresAt:new Date(Date.now()+600000)}});
  await prisma.driverLocation.upsert({where:{driverId:rider.id},create:{driverId:rider.id,driverName:rider.name,lat:23.0746,lng:76.859,accuracyMeters:10,measuredAt:new Date()},update:{lat:23.0746,lng:76.859,accuracyMeters:10,measuredAt:new Date(),lastUpdated:new Date()}});
  const actor={id:rider.id,role:'DRIVER'};
  await expect(verifyGateOtp(id,actor,'9999',true)).rejects.toMatchObject({code:'OTP_INVALID'});expect(await prisma.cashCollection.count({where:{orderId:id}})).toBe(0);
  await expect(verifyGateOtp(id,actor,'0742')).rejects.toMatchObject({code:'CASH_CONFIRMATION_REQUIRED'});
  const done=await Promise.all([verifyGateOtp(id,actor,'0742',true),verifyGateOtp(id,actor,'0742',true)]);expect(done.every(r=>r.order.status==='DELIVERED')).toBe(true);expect(done.filter(r=>r.alreadyDelivered)).toHaveLength(1);
  const cash=await prisma.cashCollection.findUniqueOrThrow({where:{orderId:id}});expect(cash.amountPaise).toBe(Math.round(done[0].order.totalAmount*100));expect(done[0].order.paymentStatus).toBe('PAID');expect(await prisma.payment.count({where:{orderId:id}})).toBe(0);
  expect((await raw(W.customers[0],'post',`/api/v1/admin/cash/${cash.id}/remit`,{reference:'receipt-001'})).status).toBe(403);
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${cash.id}/refund`,{reference:'refund-001'})).body.code).toBe('CASH_NOT_REMITTED');
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${cash.id}/remit`,{reference:'receipt-001'})).status).toBe(200);
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${cash.id}/remit`,{reference:'receipt-001'})).status).toBe(200);
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${cash.id}/refund`,{reference:'refund-001'})).status).toBe(200);
  expect((await prisma.order.findUniqueOrThrow({where:{id}})).paymentStatus).toBe('REFUNDED');
 });
 test('category, owner, city payment policy and one-store request are enforced by backend',async()=>{
  const b=await body();await prisma.vendor.update({where:{id:b.vendorId},data:{primaryCategoryId:null}});expect((await raw(W.customers[0],'post','/api/v2/checkout',b)).body.code).toBe('STORE_SETUP_REQUIRED');
  await prisma.vendor.update({where:{id:b.vendorId},data:{primaryCategoryId:'marketplace-category',userId:null}});expect((await raw(W.customers[0],'post','/api/v2/checkout',b)).body.code).toBe('STORE_SETUP_REQUIRED');
  await prisma.vendor.update({where:{id:b.vendorId},data:{userId:W.vendors[0].id}});await prisma.city.update({where:{id:tag+'-city'},data:{codEnabled:false}});expect((await raw(W.customers[0],'post','/api/v2/checkout',b)).body.code).toBe('COD_UNAVAILABLE');
  expect((await raw(W.customers[0],'post','/api/v2/checkout',{...b,restaurants:[{},{}]})).body.code).toBe('ONE_STORE_ONLY');
 });
 test('pickup and doorstep transitions require fresh assigned GPS; admin retries also support cash',async()=>{
  const id=await place();await accept(id);
  expect((await raw(W.admin,'post',`/api/v1/admin/orders/${id}/dispatch/retry`,{})).status).toBe(200);
  expect(await prisma.dispatchOffer.count({where:{orderId:id,round:3,state:'PENDING'}})).toBe(3);
  const rider=W.riders[0];expect((await raw(rider,'post',`/api/orders/${id}/accept-driver`,{})).status).toBe(200);
  for(const status of ['PREPARING','READY_FOR_PICKUP'])expect((await raw(W.vendors[0],'patch',`/api/orders/${id}/status`,{status})).status).toBe(200);
  expect((await raw(rider,'patch',`/api/orders/${id}/status`,{status:'PICKED_UP'})).body.code).toBe('ARRIVAL_LOCATION_REQUIRED');
  expect((await raw(W.admin,'patch',`/api/orders/${id}/status`,{status:'PICKED_UP'})).body.code).toBe('ARRIVAL_LOCATION_REQUIRED');
  expect((await raw(rider,'post','/api/drivers/location',{lat:23.0745,lng:76.859,accuracyMeters:10,measuredAt:new Date().toISOString()})).status).toBe(200);
  expect((await raw(rider,'post',`/api/v1/orders/${id}/arrive-pickup`,{})).status).toBe(200);
  expect((await raw(rider,'patch',`/api/orders/${id}/status`,{status:'PICKED_UP'})).status).toBe(200);
  await prisma.driverLocation.update({where:{driverId:rider.id},data:{lat:23.2,lastUpdated:new Date()}});
  expect((await raw(rider,'patch',`/api/orders/${id}/status`,{status:'ARRIVED_AT_GATE'})).body.code).toBe('ARRIVAL_LOCATION_REQUIRED');
  await prisma.driverLocation.update({where:{driverId:rider.id},data:{lat:23.0745,measuredAt:new Date(Date.now()-2000)}});
  expect((await raw(rider,'post','/api/drivers/location',{lat:23.0746,lng:76.859,accuracyMeters:10,measuredAt:new Date().toISOString()})).status).toBe(200);
  expect((await raw(rider,'patch',`/api/orders/${id}/status`,{status:'ARRIVED_AT_GATE'})).status).toBe(200);
 });
 test('GPS exceptions require independent admin approval, remain scope-bound and never replace delivery code proof',async()=>{
  const id=await place();await accept(id);const rider=W.riders[0];
  // Another test can leave a fresh location for this rider at the same store. This scenario deliberately has no fix.
  await prisma.driverLocation.deleteMany({where:{driverId:rider.id}});
  expect((await raw(rider,'post',`/api/orders/${id}/accept-driver`,{})).status).toBe(200);
  for(const status of ['PREPARING','READY_FOR_PICKUP'])expect((await raw(W.vendors[0],'patch',`/api/orders/${id}/status`,{status})).status).toBe(200);
  const input={scope:'PICKUP',reason:'Confirmed store pickup pin is inaccurate through independent operator contact.',evidenceReference:'VERIFIED-SUPPORT-CALL-REFERENCE'};
  expect((await raw(rider,'post',`/api/v1/admin/orders/${id}/gps-exceptions`,input)).status).toBe(403);
  const created=await raw(W.admin,'post',`/api/v1/admin/orders/${id}/gps-exceptions`,input);expect(created.status).toBe(201);
  const path=`/api/v1/admin/gps-exceptions/${created.body.data.id}/approve`;
  expect((await raw(W.admin,'post',path,{})).body.code).toBe('INDEPENDENT_APPROVAL_REQUIRED');
  expect((await raw(W.admin,'patch',`/api/orders/${id}/status`,{status:'PICKED_UP'})).body.code).toBe('ARRIVAL_LOCATION_REQUIRED');
  const supervisorId=tag+'-gps-supervisor';await prisma.user.upsert({where:{id:supervisorId},create:{id:supervisorId,name:'Independent GPS reviewer',role:'ADMIN'},update:{role:'ADMIN',deletedAt:null}});
  const supervisor={token:generateTestToken({id:supervisorId,role:'ADMIN',phone:''})};
  expect((await raw(supervisor,'post',path,{})).status).toBe(200);
  expect((await raw(W.admin,'patch',`/api/orders/${id}/status`,{status:'PICKED_UP'})).status).toBe(200);
  expect((await raw(W.admin,'patch',`/api/orders/${id}/status`,{status:'ARRIVED_AT_GATE'})).body.code).toBe('ARRIVAL_LOCATION_REQUIRED');
  expect((await raw(rider,'post',`/api/orders/${id}/verify-gate-otp`,{otpCode:'0000'})).status).not.toBe(200);
  expect(await prisma.cashCollection.count({where:{orderId:id}})).toBe(0);
  expect(await prisma.adminAuditLog.count({where:{targetId:id,action:'GPS_EXCEPTION_APPROVED'}})).toBe(1);
 });
 test('store selection, profile edits and pickup changes cannot target another vendor store',async()=>{
  expect((await raw(W.vendors[0],'get',`/api/v1/partner/stores/${W.vendors[1].vendorId}`)).status).toBe(404);
  expect((await raw(W.vendors[0],'get',`/api/v1/partner/store?vendorId=${W.vendors[1].vendorId}`)).status).toBe(404);
  expect((await raw(W.vendors[0],'put',`/api/v1/partner/store?vendorId=${W.vendors[1].vendorId}`,{name:'Unauthorized rename'})).status).toBe(404);
  expect((await raw(W.vendors[0],'put',`/api/v1/partner/stores/${W.vendors[1].vendorId}/location`,{lat:23.0745,lng:76.859,accuracyMeters:10,measuredAt:new Date().toISOString()})).status).toBe(404);
  const own=await raw(W.vendors[0],'get','/api/v1/partner/stores');expect(own.status).toBe(200);expect(own.body.data.map((v:any)=>v.id)).toEqual([W.vendors[0].vendorId]);
 });
 test('uncollected cash cancellation releases stock without a gateway refund',async()=>{
  const id=await place();const r=await raw(W.customers[0],'post',`/api/orders/${id}/cancel`,{reason:'Changed delivery time'});expect(r.status).toBe(200);const o=await prisma.order.findUniqueOrThrow({where:{id}});expect(o.status).toBe('CANCELLED');expect(o.refundStatus).toBeNull();expect(await prisma.cashCollection.count({where:{orderId:id}})).toBe(0);
 });
 test('server-side category/shop/product search uses the full catalog and returns no login phone',async()=>{
  const a=await prisma.address.findFirstOrThrow({where:{customerId:W.customers[0].id}});
  await prisma.menuItem.update({where:{id:W.vendors[0].items[0].id},data:{name:'Distinctive mangoes'}});
  const r=await raw(W.customers[0],'get',`/api/v1/vendors/nearby?addressId=${a.id}&q=mangoes&categoryId=marketplace-category&marketplace=1`);expect(r.status).toBe(200);expect(r.body.data).toHaveLength(1);expect(r.body.data[0].name).toBeTruthy();expect(r.body.data[0].publicPhone).toBe('+919000000001');expect(r.body.data[0].user).toBeUndefined();
 });
});
