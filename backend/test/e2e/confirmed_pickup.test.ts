import {prisma} from '../harness/db';
import {createWorld,purgeWorld,createApi,World,Api} from '../harness/journey';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
jest.setTimeout(60000);
describe('Confirmed administrative pickup changes',()=>{
 let w:World,server:TestServerInstance,api:Api;const tag='confirmedpickup';
 beforeAll(async()=>{server=await startTestServer();w=await createWorld(tag,'4',{customers:1,vendors:1,riders:0});api=createApi(server.baseUrl);});
 afterAll(async()=>{await purgeWorld(tag);await stopTestServer(server);await prisma.$disconnect();});
 test('requires administrator access and explicit confirmed coordinates, then closes and pauses coverage atomically',async()=>{
  const path='/api/v1/admin/vendors/'+w.vendors[0].vendorId+'/pickup-pin',body={lat:12.96,lng:77.58,method:'MAP',confirmed:true};
  expect((await api.raw(tag,'put',path,w.customers[0].token,body)).status).toBe(403);
  expect((await api.raw(tag,'put',path,w.admin.token,{...body,confirmed:false})).status).toBe(400);
  expect((await api.raw(tag,'put',path,w.admin.token,{...body,lat:0})).status).toBe(400);
  const response=await api.raw(tag,'put',path,w.admin.token,body);expect(response.status).toBe(200);expect(response.body.data).toMatchObject({lat:12.96,lng:77.58,locationSource:'ADMIN',coverageReviewRequired:true});
  expect((await prisma.vendor.findUniqueOrThrow({where:{id:w.vendors[0].vendorId}})).isAcceptingOrders).toBe(false);
  expect(await prisma.vendorCoverage.count({where:{vendorId:w.vendors[0].vendorId,active:true}})).toBe(0);
  expect(await prisma.adminAuditLog.count({where:{targetId:w.vendors[0].vendorId,action:'VENDOR_PICKUP_CONFIRMED'}})).toBe(1);
  expect((await api.raw(tag,'put',path,w.admin.token,body)).body.data.coverageReviewRequired).toBe(false);
 });
 test('a current order blocks rerouting the pickup and preserves its location',async()=>{
  const before=await prisma.vendor.findUniqueOrThrow({where:{id:w.vendors[0].vendorId}}),order=await prisma.order.create({data:{vendorId:before.id,customerId:w.customers[0].id,totalAmount:100,dropoffHostel:'Synthetic address'}});
  try{expect((await api.raw(tag,'put','/api/v1/admin/vendors/'+before.id+'/pickup-pin',w.admin.token,{lat:12.97,lng:77.59,method:'SEARCH',confirmed:true})).body.code).toBe('ACTIVE_ORDERS');expect((await prisma.vendor.findUniqueOrThrow({where:{id:before.id}})).lat).toBe(before.lat);}finally{await prisma.order.delete({where:{id:order.id}});}
 });
});
