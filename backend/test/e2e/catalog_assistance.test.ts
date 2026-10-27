import {prisma} from '../harness/db';
import {createWorld,purgeWorld,createApi,World,Api} from '../harness/journey';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
jest.setTimeout(60000);
describe('Exceptional catalog assistance preserves vendor ownership',()=>{
 let w:World,server:TestServerInstance,api:Api;const tag='catalogassist';
 beforeAll(async()=>{server=await startTestServer();w=await createWorld(tag,'3',{customers:1,vendors:2,riders:0});api=createApi(server.baseUrl);});
 afterAll(async()=>{await prisma.stockMovement.deleteMany({where:{menuItemId:{startsWith:tag}}});await purgeWorld(tag);await stopTestServer(server);await prisma.$disconnect();});
 test('only an administrator can record an explicitly confirmed, reasoned store intervention',async()=>{
  const path='/api/v1/admin/catalog/assistance',body={vendorId:w.vendors[0].vendorId,reason:'Approved onboarding assistance',confirmed:true};
  for(const person of [w.customers[0],w.vendors[0]])expect((await api.raw(tag,'post',path,person.token,body)).status).toBe(403);
  expect((await api.raw(tag,'post',path,w.admin.token,{...body,confirmed:false})).status).toBe(400);
  expect((await api.raw(tag,'post',path,w.admin.token,{...body,reason:'x'})).status).toBe(400);
 });
 test('store-scoped assistance is audited with the successful stock change and cannot alter another store',async()=>{
  const create=await api.raw(tag,'post','/api/v1/admin/catalog/assistance',w.admin.token,{vendorId:w.vendors[0].vendorId,reason:'Approved counted-stock recovery',confirmed:true});expect(create.status).toBe(201);
  const item=w.vendors[0].items[0],before=await prisma.menuItem.findUniqueOrThrow({where:{id:item.id}}),body={assistanceId:create.body.data.id,delta:1,reason:'Counted support receipt',expectedVersion:before.stockVersion,clientRequestId:'synthetic-assistance-stock'};
  expect((await api.raw(tag,'post','/api/v1/products/'+item.id+'/stock',w.admin.token,body)).status).toBe(200);
  expect(await prisma.adminAuditLog.count({where:{action:'CATALOG_ASSISTANCE_APPLIED',targetId:item.id}})).toBe(1);
  expect((await api.raw(tag,'post','/api/v1/products/'+w.vendors[1].items[0].id+'/stock',w.admin.token,body)).body.code).toBe('ASSISTANCE_STORE_MISMATCH');
  expect((await api.raw(tag,'post','/api/v1/products/'+item.id+'/stock',w.vendors[1].token,{...body,assistanceId:undefined})).status).toBe(404);
  await prisma.adminAuditLog.update({where:{id:create.body.data.id},data:{createdAt:new Date(0)}});
  expect((await api.raw(tag,'post','/api/v1/products/'+item.id+'/stock',w.admin.token,body)).body.code).toBe('ASSISTANCE_UNAVAILABLE');
 });
});
