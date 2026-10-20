import { randomUUID } from 'crypto';
import { prisma } from '../harness/db';
import { startTestServer, stopTestServer, TestServerInstance } from '../harness/app';
import { createWorld, resetWorldState, purgeWorld, createApi, createLedger, World, Api, Ledger, cartOf } from '../harness/journey';
import { setPaymentProvider } from '../../src/services/paymentService';
import { ensureDispatchOffer, runDispatchMaintenance } from '../../src/services/dispatch';
import { setPushProvider, noopProvider } from '../../src/services/push/provider';
import { PushMessage } from '../../src/services/push/types';
import { makePng } from '../harness/images';
import supertest from 'supertest';
import fs from 'fs';
import { waitForNotificationIntents, flushNotificationIntents } from '../../src/services/push/intents';
import { invalidateSettingsCache } from '../../src/services/settings';

jest.setTimeout(60000);
describe('Delivery operations: territorial offers, tracking privacy, support and audit',()=>{
  let server:TestServerInstance,W:World,api:Api,ledger:Ledger;
  const tag='ops';
  const raw=(who:{token:string},method:string,path:string,body?:object)=>api.raw('ops',method as any,path,who.token,body);
  const paid=async(customer=W.customers[0],vendor=W.vendors[0])=>{
    const placed=await api.place(customer,vendor);expect(placed.status).toBe(201);const id=placed.body.data.id;
    const cp=await api.createPayment(customer,id);expect(cp.status).toBe(200);const payId=`pay_ops_${randomUUID()}`;
    ledger.capture(cp.body.razorpayOrderId,payId,cp.body.amountInPaise);
    expect((await api.verify(customer,cp.body.razorpayOrderId,payId)).status).toBe(200);return id;
  };
  const accepted=async(customer=W.customers[0],vendor=W.vendors[0])=>{
    const id=await paid(customer,vendor);expect((await raw(vendor,'patch',`/api/orders/${id}/status`,{status:'ACCEPTED'})).status).toBe(200);return id;
  };
  const claim=async(id:string,rider=W.riders[0])=>raw(rider,'post',`/api/orders/${id}/accept-driver`,{});
  beforeAll(async()=>{server=await startTestServer();W=await createWorld(tag,'6',{customers:3,vendors:2,riders:3});api=createApi(server.baseUrl);});
  beforeEach(async()=>{await waitForNotificationIntents();await resetWorldState(W);ledger=createLedger();setPaymentProvider(ledger.provider);setPushProvider(noopProvider);await prisma.appSetting.deleteMany({where:{key:'fees'}});invalidateSettingsCache();});
  afterEach(async()=>{await waitForNotificationIntents();});
  afterAll(async()=>{await waitForNotificationIntents();setPaymentProvider(null);await stopTestServer(server);await purgeWorld(tag);await prisma.$disconnect();});
  test('only the offered eligible rider sees the job and another rider cannot claim it',async()=>{
    const id=await accepted();const offers=await prisma.dispatchOffer.findMany({where:{orderId:id,state:'PENDING'},include:{driver:true}});expect(offers).toHaveLength(1);
    const winner=W.riders.find((r)=>r.id===offers[0].driver.userId)!;
    for(const rider of W.riders) {
      const response=await raw(rider,'get','/api/orders/available?groups=1');expect(response.status).toBe(200);
      expect(response.body.data.map((o:any)=>o.id)).toEqual(rider.id===winner.id?[id]:[]);
      expect((await api.get(rider,id)).status).toBe(rider.id===winner.id?200:404);
      if(rider.id===winner.id) {expect(response.body.data[0].dispatchOffer.id).toBe(offers[0].id);expect(JSON.stringify(response.body)).not.toMatch(/House 2|Main Road|466114/);}
    }
    const other=W.riders.find((r)=>r.id!==winner.id)!;expect((await claim(id,other)).body.code).toBe('OFFER_EXPIRED');
    const results=await Promise.all([claim(id,winner),claim(id,winner),claim(id,other)]);expect(results.filter((r)=>r.status===200)).toHaveLength(2);
    expect((await prisma.order.findUniqueOrThrow({where:{id}})).driverId).toBe(winner.id);
  });
  test('timeout expires the first offer and selects another available rider',async()=>{
    const id=await accepted(),first=await prisma.dispatchOffer.findFirstOrThrow({where:{orderId:id,state:'PENDING'},include:{driver:true}});
    await prisma.dispatchOffer.update({where:{id:first.id},data:{expiresAt:new Date(Date.now()-1)}});
    await ensureDispatchOffer(id);
    const next=await prisma.dispatchOffer.findFirstOrThrow({where:{orderId:id,state:'PENDING'}});expect(next.driverId).not.toBe(first.driverId);
    expect((await prisma.dispatchOffer.findUniqueOrThrow({where:{id:first.id}})).state).toBe('EXPIRED');
    expect((await claim(id,W.riders.find((r)=>r.id===first.driver.userId)!)).body.code).toBe('OFFER_EXPIRED');
  });
  test('declines retry other riders, exhaust visibly, and an admin can start a new audited round',async()=>{
    const id=await accepted();
    for(let n=0;n<3;n++) {
      const offer=await prisma.dispatchOffer.findFirstOrThrow({where:{orderId:id,state:'PENDING'},include:{driver:true}});
      expect((await raw(W.riders.find((r)=>r.id===offer.driver.userId)!,'post',`/api/v1/dispatch-offers/${offer.id}/decline`,{reason:'Not available for this pickup'})).status).toBe(200);
    }
    const row=await prisma.order.findUniqueOrThrow({where:{id}});expect(row.dispatchNote).toBe('OFFERS_EXHAUSTED');expect(row.dispatchEscalatedAt).not.toBeNull();
    expect((await raw(W.customers[0],'post',`/api/v1/admin/orders/${id}/dispatch/retry`,{})).status).toBe(403);
    expect((await raw(W.admin,'post',`/api/v1/admin/orders/${id}/dispatch/retry`,{})).status).toBe(200);
    expect(await prisma.dispatchOffer.count({where:{orderId:id,round:1,state:'PENDING'}})).toBe(1);
    expect(await prisma.adminAuditLog.count({where:{targetId:id,action:'DISPATCH_RETRIED'}})).toBe(1);
  });
  test('concurrent dispatch scans preserve one live offer per order and one per idle rider',async()=>{
    await prisma.driverPartner.updateMany({where:{userId:{in:W.riders.map((r)=>r.id)}},data:{dutyStatus:'OFFLINE'}});
    const id=await accepted();expect((await prisma.order.findUniqueOrThrow({where:{id}})).dispatchNote).toBe('NO_ELIGIBLE_RIDER');
    await prisma.driverPartner.updateMany({where:{userId:{in:W.riders.map((r)=>r.id)}},data:{dutyStatus:'ONLINE'}});
    await Promise.all(Array.from({length:12},()=>ensureDispatchOffer(id)));
    expect(await prisma.dispatchOffer.count({where:{orderId:id,state:'PENDING'}})).toBe(1);
    const second=await accepted(W.customers[1],W.vendors[1]);
    const pending=await prisma.dispatchOffer.findMany({where:{orderId:{in:[id,second]},state:'PENDING'}});expect(pending).toHaveLength(2);expect(new Set(pending.map((p)=>p.driverId)).size).toBe(2);
  });
  test('an out-of-area service circle is excluded from both automatic and manual assignment',async()=>{
    const z=await prisma.deliveryZone.create({data:{cityId:`${tag}-city`,name:'Distant configured circle',centerLat:23.4,centerLng:77.2,radiusKm:1,active:true}});
    try {
      expect((await raw(W.admin,'put',`/api/v1/admin/drivers/${W.riders[0].profileId}/service-area`,{zoneId:z.id})).status).toBe(200);
      const id=await accepted();const offer=await prisma.dispatchOffer.findFirstOrThrow({where:{orderId:id,state:'PENDING'}});expect(offer.driverId).not.toBe(W.riders[0].profileId);
      const manual=await raw(W.admin,'patch',`/api/orders/${id}/reassign`,{driverId:W.riders[0].id});expect(manual.status).toBe(409);expect(manual.body.code).toBe('SERVICE_AREA_REQUIRED');
    } finally {await prisma.driverPartner.update({where:{id:W.riders[0].profileId},data:{serviceZoneId:`${tag}-zone`,cityId:`${tag}-city`}});await prisma.deliveryZone.delete({where:{id:z.id}});}
  });
  test('idle riders cannot persist GPS; completion expires address access and deletes the active fix',async()=>{
    expect((await raw(W.riders[0],'post','/api/drivers/location',{lat:23.0745,lng:76.859})).body.code).toBe('NO_ACTIVE_DELIVERY');
    expect(await prisma.driverLocation.count({where:{driverId:W.riders[0].id}})).toBe(0);
    const id=await accepted();const offer=await prisma.dispatchOffer.findFirstOrThrow({where:{orderId:id,state:'PENDING'},include:{driver:true}});const rider=W.riders.find((r)=>r.id===offer.driver.userId)!;
    expect((await claim(id,rider)).status).toBe(200);
    expect((await raw(rider,'post','/api/drivers/location',{lat:23.0745,lng:76.859,driverId:W.riders.find((r)=>r.id!==rider.id)!.id})).status).toBe(200);
    expect(await prisma.driverLocation.count({where:{driverId:rider.id}})).toBe(1);
    expect((await raw(W.admin,'post','/api/drivers/location',{lat:23.0745,lng:76.859,driverId:rider.id})).status).toBe(403);
    for(const status of ['PREPARING','READY_FOR_PICKUP'])expect((await raw(W.vendors[0],'patch',`/api/orders/${id}/status`,{status})).status).toBe(200);
    for(const status of ['PICKED_UP','ARRIVED_AT_GATE'])expect((await raw(rider,'patch',`/api/orders/${id}/status`,{status})).status).toBe(200);
    let o=await prisma.order.findUniqueOrThrow({where:{id}});const old=o.otpCode;
    await prisma.order.update({where:{id},data:{otpExpiresAt:new Date(Date.now()-1)}});
    expect((await raw(rider,'post',`/api/orders/${id}/verify-gate-otp`,{otpCode:old})).body.code).toBe('OTP_EXPIRED');
    expect((await raw(W.admin,'post',`/api/admin/orders/${id}/reset-otp-lock`,{})).status).toBe(200);
    o=await prisma.order.findUniqueOrThrow({where:{id}});expect(o.otpExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect((await raw(rider,'post',`/api/orders/${id}/verify-gate-otp`,{otpCode:o.otpCode})).status).toBe(200);
    expect(await prisma.driverLocation.count({where:{driverId:rider.id}})).toBe(0);
    expect((await raw(rider,'post','/api/drivers/location',{lat:23.0745,lng:76.859})).body.code).toBe('NO_ACTIVE_DELIVERY');
    const view=await api.get(rider,id);expect(view.status).toBe(200);expect(view.body.data.customer).toBeNull();expect(view.body.data.deliveryAddress).toBeUndefined();expect(view.body.data.dropoff).toBeNull();
    expect((await raw(rider,'get',`/api/v1/orders/${id}/route`)).status).toBe(404);
  });
  test('historical rider responses also remove legacy free-text addresses and delivery notes',async()=>{
    const o=await prisma.order.create({data:{customerId:W.customers[0].id,vendorId:W.vendors[0].vendorId,driverId:W.riders[0].id,totalAmount:100,status:'DELIVERED',paymentStatus:'PAID',dropoffHostel:'Flat 214, Private Street',dropoffNotes:'Call private customer number',deliveredAt:new Date()}});
    const response=await api.get(W.riders[0],o.id);expect(response.status).toBe(200);expect(response.body.data.customer).toBeNull();expect(response.body.data.dropoffNotes).toBeNull();expect(response.body.data.dropoff).toBeNull();expect(JSON.stringify(response.body)).not.toMatch(/Flat 214|Private Street|Call private customer/);
  });
  test('support is customer-owned and refund approval connects to the real cancellation ledger',async()=>{
    const id=await paid();const create=await raw(W.customers[0],'post','/api/v1/support-cases',{subject:'Refund request',description:'Please cancel this unaccepted paid order.',orderId:id});expect(create.status).toBe(201);
    expect((await raw(W.customers[1],'post','/api/v1/support-cases',{subject:'Other order',description:'Not mine',orderId:id})).status).toBe(404);
    expect((await raw(W.customers[1],'get','/api/v1/support-cases')).body.data).toEqual([]);
    expect((await raw(W.admin,'post',`/api/v1/admin/support-cases/${create.body.data.id}/notes`,{status:'IN_PROGRESS',message:'Refund approved under the unaccepted-order policy.'})).status).toBe(200);
    expect((await raw(W.admin,'post',`/api/admin/orders/${id}/cancel`,{reason:'Approved customer refund request'})).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({where:{id}})).paymentStatus).toBe('REFUNDED');
    expect((await raw(W.admin,'post',`/api/v1/admin/support-cases/${create.body.data.id}/notes`,{status:'RESOLVED',message:'The payment refund has been recorded.'})).status).toBe(200);
    const own=await raw(W.customers[0],'get','/api/v1/support-cases');expect(own.body.data[0].status).toBe('RESOLVED');expect(own.body.data[0].notes).toHaveLength(2);
    expect(await prisma.adminAuditLog.count({where:{targetId:create.body.data.id,action:'SUPPORT_CASE_UPDATED'}})).toBe(2);
  });
  test('durable push survives an unconfigured sender and crash replay, targets tokens by role, and suppresses duplicates',async()=>{
    const token='ops_customer_device_token_refresh';
    expect((await raw(W.customers[0],'post','/api/devices',{token,app:'CUSTOMER'})).status).toBe(200);
    const id=await paid();await waitForNotificationIntents();
    expect(await prisma.notificationIntent.count({where:{orderId:id,state:'PENDING'}})).toBeGreaterThan(0);
    const deferred=await prisma.notificationIntent.findMany({where:{orderId:id,state:'PENDING'}});
    expect(deferred.every((r)=>r.leaseUntil&&r.errorCode==='PROVIDER_UNCONFIGURED')).toBe(true);
    await flushNotificationIntents();
    expect((await prisma.notificationIntent.findMany({where:{orderId:id,state:'PENDING'},orderBy:{id:'asc'}})).map((r)=>[r.id,r.updatedAt])).toEqual(deferred.sort((a,b)=>a.id.localeCompare(b.id)).map((r)=>[r.id,r.updatedAt]));
    const sent:PushMessage[]=[];setPushProvider({enabled:true,send:async(m)=>{sent.push(m);}});
    await flushNotificationIntents();
    expect(await prisma.notificationIntent.count({where:{orderId:id,state:'PENDING'}})).toBe(0);
    const intent=await prisma.notificationIntent.create({data:{orderId:id,event:'ORDER_CANCELLED',options:{}}});
    await flushNotificationIntents();expect(sent.filter(m=>m.data.event==='ORDER_CANCELLED')).toHaveLength(1);
    await prisma.notificationIntent.update({where:{id:intent.id},data:{state:'PENDING'}});await flushNotificationIntents();
    expect(sent.filter(m=>m.data.event==='ORDER_CANCELLED')).toHaveLength(1);
    for(const message of sent){expect(message.token).toBe(token);expect(Object.keys(message.data).sort()).toEqual(['event','orderId','v']);expect(JSON.stringify(message)).not.toMatch(/House 2|Main Road|98765/);}
    expect((await raw(W.customers[1],'post','/api/devices',{token,app:'CUSTOMER'})).status).toBe(409);
    const refreshed='ops_customer_rotated_device_token';expect((await raw(W.customers[0],'post','/api/devices',{token:refreshed,app:'CUSTOMER'})).status).toBe(200);
    expect((await raw(W.customers[0],'delete','/api/devices',{token})).status).toBe(200);
    const before=sent.length;await prisma.notificationIntent.create({data:{orderId:id,event:'REFUND_PROCESSED',options:{bucket:123}}});await flushNotificationIntents();
    expect(sent.slice(before).map(m=>m.token)).toEqual([refreshed]);
  });
  test('pickup arrival and ready pushes are scoped to the vendor and assigned rider',async()=>{
    const sent:PushMessage[]=[];setPushProvider({enabled:true,send:async(m)=>{sent.push(m);}});
    for(const [user,app] of [[W.vendors[0],'VENDOR'],[W.riders[0],'DRIVER']] as const)expect((await raw(user,'post','/api/devices',{token:`ops_${app}_device_token_sample`,app})).status).toBe(200);
    const id=await accepted();expect((await claim(id)).status).toBe(200);
    expect((await raw(W.riders[1],'post',`/api/v1/orders/${id}/arrive-pickup`,{})).status).toBe(404);
    for(let n=0;n<2;n++)expect((await raw(W.riders[0],'post',`/api/v1/orders/${id}/arrive-pickup`,{})).status).toBe(200);
    await raw(W.vendors[0],'patch',`/api/orders/${id}/status`,{status:'PREPARING'});await raw(W.vendors[0],'patch',`/api/orders/${id}/status`,{status:'READY_FOR_PICKUP'});await waitForNotificationIntents();
    expect(sent.filter(m=>m.data.event==='RIDER_AT_PICKUP')).toHaveLength(1);expect(sent.find(m=>m.data.event==='RIDER_AT_PICKUP')!.token).toContain('VENDOR');
    expect(sent.filter(m=>m.data.event==='PICKUP_READY')).toHaveLength(1);expect(sent.find(m=>m.data.event==='PICKUP_READY')!.token).toContain('DRIVER');
  });
  test('support threads enforce ownership for every role and reopen on a requester reply',async()=>{
    for(const user of [W.customers[0],W.vendors[0],W.riders[0]]){
      const c=await raw(user,'post','/api/v1/support-cases',{subject:'Account help',description:'Please review my details.'});expect(c.status).toBe(201);const id=c.body.data.id;
      expect((await raw(W.customers[1],'get',`/api/v1/support-cases/${id}`)).status).toBe(404);
      await raw(W.admin,'post',`/api/v1/admin/support-cases/${id}/notes`,{status:'RESOLVED',message:'Reviewed.'});
      expect((await raw(user,'post',`/api/v1/support-cases/${id}/replies`,{message:'Another question\nwith details'})).status).toBe(200);
      const thread=await raw(user,'get',`/api/v1/support-cases/${id}?limit=1`);expect(thread.body.data.status).toBe('OPEN');expect(thread.body.data.notes).toHaveLength(1);expect(thread.body.data.nextNotesCursor).toBeTruthy();expect(JSON.stringify(thread.body.data.notes)).not.toContain('actorId');
    }
  });
  test('vendor uploads use validated private-write/public-read image storage and cannot impersonate admin',async()=>{
    const dir=fs.mkdtempSync('/tmp/market-uploads-');const previous=process.env.UPLOAD_DIR;process.env.UPLOAD_DIR=dir;
    try {
      const upload=(who:{token:string},purpose='dish',image=makePng(300,300))=>supertest(server.app).post(`/api/v1/partner/uploads/image?purpose=${purpose}`).set('Authorization',`Bearer ${who.token}`).set('Content-Type','image/png').send(image);
      const photo=await upload(W.vendors[0]);expect(photo.status).toBe(201);expect(photo.body.data.url).toMatch(/\/uploads\/dish\//);
      const categories=await prisma.category.create({data:{name:'Operations upload fixture',slug:'ops-upload-fixture',forDishes:true,forRestaurants:false}});
      const product=await raw(W.vendors[0],'post',`/api/v1/vendors/${W.vendors[0].vendorId}/products`,{name:'Uploaded grocery photo',sku:'OPS-PHOTO',productKey:'ops-photo',unit:'pcs',packSize:'1',pricePaise:1000,categoryId:categories.id,isAvailable:true,imageUrls:[photo.body.data.url]});
      expect(product.status).toBe(201);expect(product.body.data.imageUrls).toEqual([photo.body.data.url]);
      const insecure=await raw(W.vendors[0],'put',`/api/v1/products/${product.body.data.id}`,{name:'Uploaded grocery photo',sku:'OPS-PHOTO',productKey:'ops-photo',unit:'pcs',packSize:'1',pricePaise:1000,categoryId:categories.id,isAvailable:true,imageUrls:['http://untrusted.example/image.png']});expect(insecure.status).toBe(400);

      const stored=await supertest(server.app).get(new URL(photo.body.data.url).pathname);expect(stored.status).toBe(200);expect(stored.headers['x-content-type-options']).toBe('nosniff');
      expect((await upload(W.customers[0])).status).toBe(403);expect((await upload(W.vendors[0],'banner')).status).toBe(400);expect((await upload(W.vendors[0],'dish',Buffer.from('<svg/>'))).status).toBe(415);
    } finally{await prisma.menuItem.deleteMany({where:{vendorId:W.vendors[0].vendorId,sku:'OPS-PHOTO'}});await prisma.category.deleteMany({where:{slug:'ops-upload-fixture'}});if(previous===undefined)delete process.env.UPLOAD_DIR;else process.env.UPLOAD_DIR=previous;fs.rmSync(dir,{recursive:true,force:true});}
  });
  test('operations metrics and audit are backed by the selected city’s actual orders',async()=>{
    await paid();const ops=await raw(W.admin,'get',`/api/v1/admin/operations?cityId=${tag}-city&days=7`);expect(ops.status).toBe(200);expect(ops.body.data).toMatchObject({orders:1,storeOrders:1,grossPaise:20500,refundPaise:0,activeStores:2,onlineRiders:3});
    expect((await raw(W.customers[0],'get','/api/v1/admin/operations')).status).toBe(403);expect((await raw(W.admin,'get','/api/v1/admin/audit?limit=2')).body.data).toHaveLength(2);
  });
  test('approved store owners edit only their profile; address changes revoke coverage atomically and are audited',async()=>{
    const [owner,other]=W.vendors;
    const get=await raw(owner,'get','/api/v1/partner/store');expect(get.status).toBe(200);expect(get.body.data.id).toBe(owner.vendorId);expect(get.body.data).not.toHaveProperty('commissionType');
    expect((await raw(W.customers[0],'get','/api/v1/partner/store')).status).toBe(403);
    const original=await prisma.vendor.findUniqueOrThrow({where:{id:other.vendorId}});
    expect((await raw(owner,'put','/api/v1/partner/store',{vendorId:other.vendorId,name:'Wrong store'})).status).toBe(400);
    expect((await raw(owner,'put','/api/v1/partner/store',{name:'Name that must not save',bannerImage:'http://untrusted.example/banner.png'})).status).toBe(400);
    expect((await prisma.vendor.findUniqueOrThrow({where:{id:owner.vendorId}})).name).toBe(get.body.data.name);
    expect((await raw(owner,'put','/api/v1/partner/store',{name:original.name})).body.code).toBe('NAME_TAKEN');
    const saved=await raw(owner,'put','/api/v1/partner/store',{name:'Local Grocery Profile',address:'New confirmed pickup address',bannerImage:''});expect(saved.status).toBe(200);expect(saved.body.coverageNeedsReview).toBe(true);
    expect(await prisma.vendorCoverage.count({where:{vendorId:owner.vendorId,active:true}})).toBe(0);
    expect((await api.place(W.customers[0],owner)).body.code).toBe('AREA_UNSUPPORTED');
    const repeated=await raw(owner,'put','/api/v1/partner/store',{name:'Local Grocery Profile',address:'New confirmed pickup address',bannerImage:''});expect(repeated.body.changed).toBe(false);
    expect(await prisma.adminAuditLog.count({where:{action:'STORE_PROFILE_UPDATED',targetId:owner.vendorId}})).toBe(1);
    expect((await prisma.vendor.findUniqueOrThrow({where:{id:other.vendorId}})).name).toBe(original.name);
    await prisma.vendor.update({where:{id:owner.vendorId},data:{name:get.body.data.name,address:get.body.data.address}});
    await prisma.vendorCoverage.updateMany({where:{vendorId:owner.vendorId},data:{active:true}});
  });

});
