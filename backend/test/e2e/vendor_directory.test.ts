import {prisma} from '../harness/db';
import {createWorld,purgeWorld,createApi,World,Api} from '../harness/journey';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
jest.setTimeout(60000);
describe('Admin compact vendor directory',()=>{
 let w:World,server:TestServerInstance,api:Api;const tag='vendordirectory';
 beforeAll(async()=>{server=await startTestServer();w=await createWorld(tag,'9',{customers:1,vendors:2,riders:0});api=createApi(server.baseUrl);await prisma.vendor.update({where:{id:w.vendors[0].vendorId},data:{name:'Synthetic Vegetable Shop',isAcceptingOrders:false}});});
 afterAll(async()=>{await purgeWorld(tag);await stopTestServer(server);await prisma.$disconnect();});
 test('server filtering and pagination return exact totals and compact fields without payout data',async()=>{
  const response=await api.raw(tag,'get',`/api/v1/admin/vendor-directory?cityId=${tag}-city&limit=1`,w.admin.token);expect(response.status).toBe(200);expect(response.body.data.total).toBe(2);expect(response.body.data.rows).toHaveLength(1);expect(response.body.data.rows[0]).toMatchObject({productCount:2,activeOrdersCount:0});expect(response.body.data.rows[0].userId).toBeUndefined();expect(response.body.data.rows[0].menuItems).toBeUndefined();
  const filtered=await api.raw(tag,'get',`/api/v1/admin/vendor-directory?cityId=${tag}-city&q=Vegetable&open=false`,w.admin.token);expect(filtered.body.data.total).toBe(1);expect(filtered.body.data.rows[0].id).toBe(w.vendors[0].vendorId);
  expect((await api.raw(tag,'get','/api/v1/admin/vendor-directory?limit=1000',w.admin.token)).status).toBe(400);
 });
 test('only approved backend administrators can query directory, details and audit',async()=>{
  for(const path of ['/api/v1/admin/vendor-directory','/api/v1/admin/vendor-directory/'+w.vendors[0].vendorId,'/api/v1/admin/vendor-directory/'+w.vendors[0].vendorId+'/audit'])expect((await api.raw(tag,'get',path,w.customers[0].token)).status).toBe(403);
  const detail=await api.raw(tag,'get','/api/v1/admin/vendor-directory/'+w.vendors[0].vendorId,w.admin.token);expect(detail.status).toBe(200);expect(detail.body.data.userId).toBe(w.vendors[0].id);expect(detail.body.data.upiId).toBeUndefined();
 });
});
