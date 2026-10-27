import {prisma} from '../harness/db';
import {createWorld,purgeWorld,createApi,World,Api} from '../harness/journey';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
jest.setTimeout(60000);
describe('Authorized real marketplace dashboard',()=>{
 let w:World,server:TestServerInstance,api:Api;const tag='overviewcohort',ids:string[]=[];
 beforeAll(async()=>{server=await startTestServer();w=await createWorld(tag,'8',{customers:1,vendors:1,riders:1});api=createApi(server.baseUrl);});
 afterAll(async()=>{await prisma.cashLedgerEvent.deleteMany({where:{collection:{orderId:{in:ids}}}});await prisma.cashCollection.deleteMany({where:{orderId:{in:ids}}});await prisma.payment.deleteMany({where:{orderId:{in:ids}}});await prisma.order.deleteMany({where:{id:{in:ids}}});await purgeWorld(tag);await stopTestServer(server);await prisma.$disconnect();});
 test('returns real zero counts, rejects unauthorized callers and validates bounded ranges',async()=>{
  const city=await prisma.city.create({data:{code:tag+'-empty',name:'Synthetic empty city',state:'Karnataka'}});
  try{const result=await api.raw(tag,'get','/api/v1/admin/dashboard?cityId='+city.id,w.admin.token);expect(result.status).toBe(200);expect(result.body.data).toMatchObject({orders:0,capturedPaise:0,receivedCashPaise:0,pendingCashPaise:0});expect(result.body.data.trend).toHaveLength(7);expect(result.body.data.statuses).toEqual([]);}finally{await prisma.city.delete({where:{id:city.id}});}
  expect((await api.raw(tag,'get','/api/v1/admin/dashboard',w.customers[0].token)).status).toBe(403);
  expect((await api.raw(tag,'get','/api/v1/admin/dashboard?days=91',w.admin.token)).status).toBe(400);
 });
 test('payment attempts and cash events do not multiply orders; uncollected COD is not received funds',async()=>{
  const vendor=await prisma.vendor.findFirstOrThrow({where:{id:{startsWith:tag}}});const customer=await prisma.user.findUniqueOrThrow({where:{id:w.customers[0].id}});
  for(const [index,method] of ['ONLINE','COD','COD'].entries()){
   // COD is a v2 store-order contract; the third order is genuinely uncollected/open.
   const o=await prisma.order.create({data:{customerId:customer.id,vendorId:vendor.id,totalAmount:100,workflowVersion:2,paymentMethod:method,dropoffHostel:'Synthetic fixture address',status:index===2?'PLACED':'DELIVERED',paymentStatus:index===2?'PENDING':'PAID'}});ids.push(o.id);
  }
  await prisma.payment.createMany({data:[{orderId:ids[0],razorpayOrderId:tag+'-captured',amount:100,status:'PAID',capturedAmountPaise:10000},{orderId:ids[0],razorpayOrderId:tag+'-failed',amount:100,status:'FAILED'}]});
  const c=await prisma.cashCollection.create({data:{orderId:ids[1],driverUserId:w.riders[0].id,amountPaise:10000}});
  for(const [kind,amountPaise] of [['PLATFORM_RECEIPT',3000],['PLATFORM_RECEIPT',2000],['HANDOVER_FAILED',1000]] as const)await prisma.cashLedgerEvent.create({data:{collectionId:c.id,driverUserId:w.riders[0].id,kind,amountPaise,reference:'synthetic',reason:'Synthetic test evidence',actorId:w.admin.id,businessDate:'2026-10-27',idempotencyKey:tag+kind+amountPaise}});
  const result=await api.raw(tag,'get','/api/v1/admin/dashboard?cityId='+vendor.cityId,w.admin.token);expect(result.status).toBe(200);expect(result.body.data).toMatchObject({orders:3,delivered:2,active:1,capturedPaise:10000,receivedCashPaise:5000,pendingCashPaise:5000});expect(result.body.data.payments).toEqual(expect.arrayContaining([{name:'ONLINE',count:1},{name:'COD',count:2}]));
  const filtered=await api.raw(tag,'get','/api/orders?cityId='+vendor.cityId+'&paymentMethod=COD&from='+encodeURIComponent(result.body.data.from)+'&to='+encodeURIComponent(result.body.data.to),w.admin.token);expect(filtered.status).toBe(200);expect(filtered.body.data).toHaveLength(2);
 });
});
