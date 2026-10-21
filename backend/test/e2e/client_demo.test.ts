import {randomUUID} from 'crypto';
import {readFileSync,mkdtempSync,rmSync} from 'fs';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import {prisma} from '../harness/db';
import {createTestApp} from '../harness/app';
import {generateTestToken} from '../harness/auth';
import {purgeWorld} from '../harness/journey';
import {validateScenario,installDemoImages,createDemoScenario} from '../../src/demo/scenario';
import {riderServesOrders} from '../../src/services/dispatch';
import {ORDER_VIEW_INCLUDE} from '../../src/services/orderView';
import {routeBetween} from '../../src/services/maps';
import {probeImage} from '../../src/utils/imageProbe';

describe('Synthetic client demo through real marketplace services',()=>{
 const root=path.resolve(__dirname,'../../..'),config=JSON.parse(readFileSync(path.join(root,'demo/scenario.json'),'utf8'));
 config.namespace=`gzdemo-qa-${randomUUID().slice(0,8)}`;
 const request=supertest(createTestApp().app),dir=mkdtempSync(path.join(os.tmpdir(),'grozo-demo-images-'));
 let data:Awaited<ReturnType<typeof createDemoScenario>>,orderId:string;
 const previousUpload=process.env.UPLOAD_DIR;
 const auth=(id:string,role:'STUDENT'|'VENDOR'|'DRIVER')=>({Authorization:`Bearer ${generateTestToken({id,role,phone:''})}`});
 beforeAll(async()=>{process.env.UPLOAD_DIR=dir;const images=installDemoImages(root,dir,'http://127.0.0.1:5001');data=await createDemoScenario(prisma,config,images);});
 afterAll(async()=>{
  await purgeWorld(config.namespace);
  await prisma.category.deleteMany({where:{slug:{startsWith:config.namespace}}});
  await prisma.driverPartner.deleteMany({where:{userId:{startsWith:config.namespace}}});
  await prisma.address.deleteMany({where:{cityId:config.namespace}});
  await prisma.deliveryZone.deleteMany({where:{cityId:config.namespace}});
  await prisma.city.deleteMany({where:{id:config.namespace}});
  if(previousUpload===undefined)delete process.env.UPLOAD_DIR;else process.env.UPLOAD_DIR=previousUpload;
  rmSync(dir,{recursive:true,force:true});await prisma.$disconnect();
 });
 test('locations use unchanged published anchors and reject unsupported demo addresses',()=>{
  expect(validateScenario(config)).toBe(config);
  const invalid=structuredClone(config);invalid.points[0].lat=0;
  expect(()=>validateScenario(invalid)).toThrow('published coordinate');
  const outside=structuredClone(config);outside.points[2].lat=13.5;
  expect(()=>validateScenario(outside)).toThrow('outside');
 });
 test('every owned delivery address discovers both simulated stores with local product photos',async()=>{
  for(const id of data.addressIds){const address=await prisma.address.findUniqueOrThrow({where:{id}});const r=await request.get(`/api/v1/vendors/nearby?addressId=${id}`).set(auth(address.customerId,'STUDENT'));expect(r.status).toBe(200);expect(r.body.data.map((s:any)=>s.id).sort()).toEqual([...data.storeIds].sort());for(const s of r.body.data){expect(s.name).toContain('Simulated');expect(s.lat).not.toBe(0);expect(s.menuItems.length).toBeGreaterThan(0);expect(s.menuItems.every((p:any)=>p.imageUrl.includes('/uploads/dish/2026/'))).toBe(true);}}
 });
 test('approved demo vendors and riders use real password authentication, with role isolation',async()=>{
  for(const a of data.accounts.filter((a:any)=>a.role!=='STUDENT')){const r=await request.post('/api/auth/partner-login').send({phone:a.phone,password:a.password,role:a.role});expect(r.status).toBe(200);expect(r.body.token).toEqual(expect.any(String));const wrong=await request.post('/api/auth/partner-login').send({phone:a.phone,password:'incorrect-demo-password',role:a.role});expect(wrong.status).toBe(401);}
 });
 test('catalog imagery is served locally and vendor image upload keeps existing validation',async()=>{
  const row=await prisma.menuItem.findFirstOrThrow({where:{vendorId:data.storeIds[0]}});const image=await request.get(new URL(row.imageUrl).pathname);expect(image.status).toBe(200);expect(image.headers['content-type']).toMatch(/image\/webp/);expect(probeImage(image.body)).toMatchObject({width:480,height:480});
  const vendor=data.accounts.find((a:any)=>a.role==='VENDOR');const file=readFileSync(path.join(root,'demo/assets/products/milk.webp'));const upload=await request.post('/api/v1/partner/uploads/image?purpose=dish').set(auth(vendor.userId,'VENDOR')).set('Content-Type','image/webp').send(file);expect(upload.status).toBe(201);
  expect((await request.post('/api/v1/partner/uploads/image?purpose=dish').set('Content-Type','image/webp').send(file)).status).toBe(401);
 });
 test('quotes and orders keep server prices and stock reservations for the configured addresses',async()=>{
  const a=await prisma.address.findUniqueOrThrow({where:{id:data.addressIds[0]}});const itemId=`${data.storeIds[0]}-milk`;const headers=auth(a.customerId,'STUDENT');
  const quote=await request.post('/api/v1/orders/quote').set(headers).send({addressId:a.id,restaurants:[{vendorId:data.storeIds[0],items:[{itemId,quantity:1}]}]});expect(quote.status).toBe(200);
  const r=await request.post('/api/v1/orders').set(headers).send({vendorId:data.storeIds[0],addressId:a.id,items:[{itemId,quantity:1}],clientRequestId:randomUUID(),deliveryFee:0,totalAmount:1});expect(r.status).toBe(201);orderId=r.body.data.id;expect(r.body.data.totalAmount).toBe(quote.body.data.total);
  const order=await prisma.order.findUniqueOrThrow({where:{id:orderId},include:ORDER_VIEW_INCLUDE});expect((order.addressSnapshot as any).lat).toBe(config.points[2].lat);expect(order.items[0].price).toBe(config.products[0].pricePaise/100);
 });
 test('rider zone eligibility and routing adapter use the configured order pins',async()=>{
  const order=await prisma.order.findUniqueOrThrow({where:{id:orderId},include:ORDER_VIEW_INCLUDE});const rider=await prisma.driverPartner.findUniqueOrThrow({where:{userId:data.riderIds[0]},include:{serviceZone:{include:{city:true}}}});expect(rider.approvalStatus).toBe('APPROVED');expect(rider.dutyStatus).toBe('OFFLINE');expect(riderServesOrders(rider,[order])).toBe(true);expect(riderServesOrders({...rider,cityId:'other-city'},[order])).toBe(false);
  const to=order.addressSnapshot as any;let called='';const route=await routeBetween(order.vendor,to,{MAPS_ROUTER_URL:'https://routing.example.invalid/route/v1/driving'},async(input)=>{called=String(input);return new Response(JSON.stringify({routes:[{distance:1200,duration:240,geometry:{coordinates:[[order.vendor.lng,order.vendor.lat],[to.lng,to.lat]]}}]}),{status:200});});expect(called).toContain(`${order.vendor.lng},${order.vendor.lat};${to.lng},${to.lat}`);expect(route.coordinates[0]).toEqual({lat:config.points[0].lat,lng:config.points[0].lng});
  await expect(routeBetween(order.vendor,to,{})).rejects.toMatchObject({code:'MAPS_UNAVAILABLE'});
 });
});
