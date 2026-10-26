import {prisma} from '../harness/db';
import {createWorld,purgeWorld,createApi,World,Api,until} from '../harness/journey';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
import {kmBetween} from '../../src/services/geography';
jest.setTimeout(60000);
describe('Admin confirmed pickup and authoritative coverage',()=>{
 let w:World,server:TestServerInstance,api:Api;const tag='storecoverage',cityId=tag+'-city',zoneId=tag+'-zone',point={lat:12.96,lng:77.58};const created:string[]=[];
 const body=(extra:object={})=>({name:'Synthetic coverage store',address:'Synthetic test pickup only',cityId,pinCode:'560002',locality:'Synthetic area',...point,zoneId,...extra});
 const raw=(actor:{token:string},data:object)=>api.raw(tag,'post','/api/v1/admin/stores',actor.token,data);
 beforeAll(async()=>{server=await startTestServer();w=await createWorld(tag,'6',{customers:1,vendors:0,riders:0});api=createApi(server.baseUrl);await prisma.city.upsert({where:{id:cityId},create:{id:cityId,code:tag,name:'Synthetic test city',state:'Karnataka',active:true},update:{active:true}});await prisma.deliveryZone.upsert({where:{id:zoneId},create:{id:zoneId,cityId,name:'Synthetic coverage',centerLat:point.lat,centerLng:point.lng,radiusKm:3,active:true,baseFeePaise:2500},update:{active:true,radiusKm:3,centerLat:point.lat,centerLng:point.lng,cityId}});});
 beforeEach(async()=>{await prisma.city.update({where:{id:cityId},data:{active:true}});await prisma.deliveryZone.update({where:{id:zoneId},data:{active:true,radiusKm:3}});});
 afterEach(async()=>{for(const id of created.splice(0))await prisma.vendor.delete({where:{id}});});
 afterAll(async()=>{await purgeWorld(tag);await stopTestServer(server);await prisma.$disconnect();});
 test('center and exact configured boundary succeed as closed stores with audited coverage',async()=>{
  for(const pin of [point,{lat:12.98,lng:77.58}]){
   await prisma.deliveryZone.update({where:{id:zoneId},data:{radiusKm:kmBetween(point,pin)||3}});
   const response=await raw(w.admin,body(pin));expect(response.status).toBe(201);created.push(response.body.data.id);
   expect(response.body.data.isAcceptingOrders).toBe(false);expect(await prisma.vendorCoverage.count({where:{vendorId:response.body.data.id,zoneId,active:true}})).toBe(1);
  }
 });
 test('outside, wrong-city, disabled and unknown coverage are refused without creating a store',async()=>{
  expect((await raw(w.admin,body({lat:13.5}))).body).toMatchObject({code:'ZONE_MISMATCH',field:'zoneId'});
  expect((await raw(w.admin,body({zoneId:'unknown'}))).status).toBe(400);
  await prisma.deliveryZone.update({where:{id:zoneId},data:{active:false}});expect((await raw(w.admin,body())).body.code).toBe('ZONE_MISMATCH');
  await prisma.deliveryZone.update({where:{id:zoneId},data:{active:true}});
  const other=await prisma.city.create({data:{code:tag+'-other',name:'Synthetic other city',state:'Karnataka',active:true}});
  try{expect((await raw(w.admin,body({cityId:other.id}))).body.code).toBe('ZONE_MISMATCH');}finally{await prisma.city.delete({where:{id:other.id}});}
  expect(await prisma.vendor.count({where:{name:'Synthetic coverage store'}})).toBe(0);
 });
 test('no-zone draft remains closed and unserviceable, invalid coordinates and unauthorized callers fail',async()=>{
  const r=await raw(w.admin,body({zoneId:undefined,lat:14}));expect(r.status).toBe(201);created.push(r.body.data.id);expect(r.body.data.isAcceptingOrders).toBe(false);expect(await prisma.vendorCoverage.count({where:{vendorId:r.body.data.id}})).toBe(0);
  expect((await raw(w.admin,body({lat:0,lng:0}))).body.code).toBe('BAD_LOCATION');expect((await raw(w.customers[0],body())).status).toBe(403);
  await prisma.city.update({where:{id:cityId},data:{active:false}});expect((await raw(w.admin,body())).body.code).toBe('CITY_REQUIRED');
 });
 test('a concurrent committed zone disable is revalidated under its row lock',async()=>{
  let release!:()=>void,ready!:()=>void;const gated=new Promise<void>(r=>{release=r;}),locked=new Promise<void>(r=>{ready=r;});
  const edit=prisma.$transaction(async tx=>{await tx.deliveryZone.update({where:{id:zoneId},data:{active:false}});ready();await gated;});await locked;
  const pending=raw(w.admin,body());
  try{await until(async()=>{const rows=await prisma.$queryRaw<{waiting:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%DeliveryZone%FOR SHARE%') AS waiting`;return rows[0].waiting;},4000,'create waits for concurrent zone edit');}finally{release();await edit;}
  expect((await pending).body.code).toBe('ZONE_MISMATCH');expect(await prisma.vendor.count({where:{name:'Synthetic coverage store'}})).toBe(0);
 });
});
