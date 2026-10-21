/** Real PostgreSQL + official Clerk JWT/signature verification; provider HTTP is an explicit fixture.
 * This suite does NOT prove Clerk-hosted login or Android behavior.
 */
import {generateKeyPairSync,createHmac,randomBytes} from 'crypto';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import {io,Socket} from 'socket.io-client';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
import {prisma,cleanTestOrders,cleanTestUsers,seedTestDatabase} from '../harness/db';
import {linkClerkIdentity,provisionClerkAdmin,resolveClerkSession,setClerkTestTransport,verifiedClerkClaims} from '../../src/services/clerkIdentity';
import {authMode} from '../../src/config/authMode';

const issuer='https://grozo-clerk-fixture.clerk.accounts.dev',party='https://admin.grozo.test';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const original={...process.env};
const webhookBytes=randomBytes(32);
const sessions=new Map<string,string>(),revoked=new Set<string>(),banned=new Set<string>();
let offline=false,server:TestServerInstance,request:ReturnType<typeof supertest>;
const sockets:Socket[]=[];
function token(subject='user_CustomerA',overrides:Record<string,unknown>={}) {
  const sid=`sess_${subject.slice(5)}`;sessions.set(sid,subject);
  return jwt.sign({sub:subject,sid,iss:issuer,azp:party,aud:'grozo-api-test',v:2,sts:'active',...overrides},privateKey,{algorithm:'RS256',expiresIn:'2m',keyid:'grozo_fixture_key'});
}
const header=(subject?:string) => ({Authorization:`Bearer ${token(subject)}`});
async function webhook(type:string,subject:string,at:number,id:string,extra:Record<string,unknown>={}) {
  const body=JSON.stringify({object:'event',type,timestamp:at,data:{id:subject,updated_at:at,...extra}});
  const timestamp=Math.floor(Date.now()/1000).toString();
  const signature=createHmac('sha256',webhookBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  return request.post('/api/webhooks/clerk').set({'Content-Type':'application/json','svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${signature}`}).send(body);
}
beforeAll(async()=>{
  process.env.DELIVERY_PROOF_SECRET='local-clerk-delivery-proof-fixture-only-not-a-provider-credential';
  Object.assign(process.env,{AUTH_MODE:'clerk-test',CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from('grozo-clerk-fixture.clerk.accounts.dev$').toString('base64'),CLERK_SECRET_KEY:'sk_test_'+'fixture_not_a_provider_credential',CLERK_JWT_KEY:publicKey.export({type:'spki',format:'pem'}).toString(),CLERK_ISSUER:issuer,CLERK_AUTHORIZED_PARTIES:party,CLERK_AUDIENCE:'grozo-api-test',CLERK_WEBHOOK_SIGNING_SECRET:'whsec_'+webhookBytes.toString('base64'),CLERK_ALLOW_NATIVE_WITHOUT_AZP:'false',CLERK_ADMIN_USER_IDS:'user_Admin'});
  setClerkTestTransport({
    user:async id=>{if(offline)throw Error('fixture network outage');return {id,banned:banned.has(id),firstName:'Synthetic',lastName:'Tester'};},
    session:async id=>{if(offline)throw Error('fixture network outage');if(!sessions.has(id))throw Object.assign(Error('missing'),{status:404});return {id,userId:sessions.get(id)!,status:revoked.has(id)?'revoked':'active'};},
    revoke:async id=>{revoked.add(id);},deleteUser:async()=>({}),
  });
  await cleanTestOrders();await cleanTestUsers();await seedTestDatabase();
  await prisma.clerkWebhookDelivery.deleteMany();await prisma.clerkIdentityState.deleteMany();
  server=await startTestServer();request=supertest(server.app);
});
afterAll(async()=>{
  sockets.forEach(s=>s.disconnect());await stopTestServer(server);
  setClerkTestTransport(null);
  await cleanTestOrders();await cleanTestUsers();await prisma.clerkWebhookDelivery.deleteMany();await prisma.clerkIdentityState.deleteMany();
  await prisma.driverPartner.deleteMany({where:{user:{clerkUserId:{not:null}},userId:{notIn:['usr-4']}}});
  await prisma.vendor.deleteMany({where:{name:{in:['Simulated Grocery','Synthetic other store']}}});
  await prisma.user.deleteMany({where:{id:{notIn:['usr-3','usr-4','usr-5']},OR:[{clerkUserId:{not:null}},{name:{in:['Existing synthetic customer','Other synthetic customer']}}]}});
  await prisma.user.updateMany({where:{clerkUserId:{not:null}},data:{clerkUserId:null}});
  await prisma.city.deleteMany({where:{code:'SYNTHETIC-CLERK-LINK'}});
  await prisma.adminAuditLog.deleteMany({where:{action:{startsWith:'CLERK_'}}});
  for(const key of Object.keys(process.env)) if(!(key in original)) delete process.env[key];
  Object.assign(process.env,original);await prisma.$disconnect();
});
beforeEach(()=>{offline=false;});

test('mode isolation rejects unknown and deployed clerk-test configuration',()=>{
  expect(()=>authMode({AUTH_MODE:'anything'})).toThrow();
  expect(()=>authMode({AUTH_MODE:'clerk-test',NODE_ENV:'production'})).toThrow();
});
test.each(['/auth/google','/auth/partner-login','/auth/admin-login','/auth/partner-signup'])('legacy endpoint %s cannot issue sessions in Clerk mode',async path=>{
  const response=await request.post('/api'+path).send({});expect(response.status).toBe(410);expect(response.body.token).toBeUndefined();
});
test('missing bearer token returns JSON 401',async()=>{const r=await request.get('/api/auth/profile');expect(r.status).toBe(401);expect(r.headers.location).toBeUndefined();});
test('new subject provisions customer once and ignores editable ADMIN metadata',async()=>{
  const bearer=token('user_CustomerA',{role:'ADMIN',public_metadata:{role:'ADMIN'}});
  const responses=await Promise.all([request.get('/api/auth/profile').set('Authorization',`Bearer ${bearer}`),request.get('/api/auth/profile').set('Authorization',`Bearer ${bearer}`)]);
  expect(responses.map(r=>r.status)).toEqual([200,200]);expect(responses[0].body.user.id).toBe(responses[1].body.user.id);expect(responses[0].body.user.role).toBe('STUDENT');
  expect(await prisma.user.count({where:{clerkUserId:'user_CustomerA'}})).toBe(1);
  expect((await request.get('/api/admin/partners').set(header())).status).toBe(403);
});
test.each([
  ['expired',{exp:1}],['wrong issuer',{iss:'https://attacker.example'}],['wrong party',{azp:'https://attacker.example'}],['wrong audience',{aud:'other-api'}],['missing session',{sid:undefined}],
])('%s token is rejected by official verification and Grozo session policy',async(_label,claims)=>{
  const raw=('exp' in claims)?jwt.sign({sub:'user_Expired',sid:'sess_Expired',iss:issuer,azp:party,aud:'grozo-api-test',exp:1},privateKey,{algorithm:'RS256'}):token('user_Invalid',claims);
  await expect(verifiedClerkClaims(raw)).rejects.toMatchObject({status:401});
});
test('forged signature and invalid JWT rejected; no legacy fallback',async()=>{
  const other=generateKeyPairSync('rsa',{modulusLength:2048});
  const raw=jwt.sign({sub:'user_Forge',sid:'sess_Forge',iss:issuer,azp:party,aud:'grozo-api-test'},other.privateKey,{algorithm:'RS256'});
  await expect(resolveClerkSession(raw)).rejects.toMatchObject({status:401});
  for(const value of ['not-a-token',jwt.sign({id:'usr-5',role:'ADMIN'},process.env.JWT_SECRET!)]) expect((await request.get('/api/admin/partners').set('Authorization',`Bearer ${value}`)).status).toBe(401);
});
test('provider revocation and suspension are checked online',async()=>{
  const raw=token('user_Revoked');revoked.add('sess_Revoked');await expect(resolveClerkSession(raw)).rejects.toMatchObject({status:401});
  banned.add('user_Banned');await expect(resolveClerkSession(token('user_Banned'))).rejects.toMatchObject({status:403});
});
test('provider outage fails closed with 503 without claiming invalid credentials',async()=>{
  offline=true;expect((await request.get('/api/auth/profile').set(header('user_Offline'))).status).toBe(503);offline=false;
});
test('native token without azp requires explicit native policy and no browser origin',async()=>{
  const raw=token('user_Native',{azp:undefined});await expect(verifiedClerkClaims(raw)).rejects.toMatchObject({status:401});
  process.env.CLERK_ALLOW_NATIVE_WITHOUT_AZP='true';expect((await verifiedClerkClaims(raw)).sub).toBe('user_Native');
  expect((await request.get('/api/auth/profile').set('Authorization',`Bearer ${raw}`)).status).toBe(200);
  await expect(verifiedClerkClaims(raw,party)).rejects.toMatchObject({status:401});process.env.CLERK_ALLOW_NATIVE_WITHOUT_AZP='false';
});
test('controlled linking preserves UUID and related addresses, idempotently; conflicts cannot reassociate',async()=>{
  const user=await prisma.user.create({data:{name:'Existing synthetic customer'}});
  const city=await prisma.city.create({data:{name:'Synthetic link test city',state:'Karnataka',code:'SYNTHETIC-CLERK-LINK'}});
  const address=await prisma.address.create({data:{customerId:user.id,cityId:city.id,label:'Home',locality:'Simulated',houseNumber:'12',street:'Synthetic address',pinCode:'560001',lat:12.97,lng:77.59}});
  expect((await linkClerkIdentity(user.id,'user_Linked','test ownership ticket')).alreadyLinked).toBe(false);
  expect((await linkClerkIdentity(user.id,'user_Linked','test ownership ticket')).alreadyLinked).toBe(true);
  expect((await prisma.address.findUniqueOrThrow({where:{id:address.id}})).customerId).toBe(user.id);
  await expect(linkClerkIdentity(user.id,'user_Another','test')).rejects.toMatchObject({status:409});
  const other=await prisma.user.create({data:{name:'Other synthetic customer'}});
  await expect(linkClerkIdentity(other.id,'user_Linked','test')).rejects.toMatchObject({status:409});
});
test('ADMIN requires explicit operator provisioning and exact allowlisted subject',async()=>{
  await expect(provisionClerkAdmin('user_CustomerA','test')).rejects.toMatchObject({status:403});
  const result=await provisionClerkAdmin('user_Admin','test operator');expect(result.role).toBe('ADMIN');
  expect((await request.get('/api/admin/partners').set(header('user_Admin'))).status).toBe(200);
  process.env.CLERK_ADMIN_USER_IDS='';expect((await request.get('/api/admin/partners').set(header('user_Admin'))).status).toBe(403);process.env.CLERK_ADMIN_USER_IDS='user_Admin';
});
test('customer login alone cannot access vendor or rider operations',async()=>{
  expect((await request.get('/api/partner/me').set(header())).status).toBe(403);
  expect((await request.patch('/api/vendors/ven-1/status').set(header()).send({isAcceptingOrders:false})).status).toBe(403);
  expect((await request.post('/api/drivers/duty-status').set(header()).send({isOnline:true})).status).toBe(403);
});
test('new vendor and rider applications are pending, not approved by the body',async()=>{
  const vendor=await request.post('/api/partner/clerk-application').set(header('user_VendorApplicant')).send({role:'VENDOR',name:'Synthetic Owner',phone:'9000000011',restaurantName:'Simulated Grocery',category:'Groceries',address:'Synthetic store pickup location',approvalStatus:'APPROVED'});
  expect(vendor.status).toBe(201);expect(vendor.body.approvalStatus).toBe('PENDING');
  expect((await request.patch('/api/vendors/'+vendor.body.vendor.id+'/status').set(header('user_VendorApplicant')).send({isAcceptingOrders:true})).status).toBe(403);
  const rider=await request.post('/api/partner/clerk-application').set(header('user_RiderApplicant')).send({role:'DRIVER',name:'Synthetic Rider',phone:'9000000012',vehicleType:'CYCLE',approvalStatus:'APPROVED'});
  expect(rider.status).toBe(201);expect(rider.body.approvalStatus).toBe('PENDING');
});
test('approved vendor still cannot alter another store product',async()=>{
  await linkClerkIdentity('usr-3','user_Vendor','test operator');
  const stranger=await prisma.vendor.create({data:{name:'Synthetic other store',category:'Groceries',address:'Simulated',bannerImage:'',approvalStatus:'APPROVED'}});
  const response=await request.patch('/api/vendors/'+stranger.id+'/status').set(header('user_Vendor')).send({isAcceptingOrders:false});expect(response.status).toBe(403);
});
test('verified webhook duplicates, stale updates and terminal deletion are safe',async()=>{
  const identity=await resolveClerkSession(token('user_Webhook'));
  const city=await prisma.city.findUniqueOrThrow({where:{code:'SYNTHETIC-CLERK-LINK'}});
  await prisma.address.create({data:{customerId:identity.id,cityId:city.id,label:'Home',locality:'Simulated',houseNumber:'12',street:'Synthetic address',pinCode:'560001',lat:12.97,lng:77.59}});
  const at=Date.now();expect((await webhook('user.updated','user_Webhook',at,'msg_a',{banned:true})).status).toBe(200);
  expect((await webhook('user.updated','user_Webhook',at,'msg_a',{banned:true})).body.duplicate).toBe(true);
  await webhook('user.updated','user_Webhook',at-1000,'msg_old',{banned:false});
  await expect(resolveClerkSession(token('user_Webhook'))).rejects.toMatchObject({status:403});
  await webhook('user.deleted','user_Webhook',at+1000,'msg_delete');
  await webhook('user.created','user_Webhook',at+2000,'msg_resurrect');
  await expect(resolveClerkSession(token('user_Webhook'))).rejects.toMatchObject({status:401});
  expect((await prisma.user.findUniqueOrThrow({where:{clerkUserId:'user_Webhook'}})).deletedAt).not.toBeNull();
  expect(await prisma.address.count({where:{customerId:identity.id}})).toBe(0);
  await expect(linkClerkIdentity(identity.id,'user_Webhook','test')).rejects.toMatchObject({status:409});
});
test('unsigned Clerk webhook and unsigned Razorpay webhook are independently rejected',async()=>{
  expect((await request.post('/api/webhooks/clerk').send({type:'user.deleted',data:{id:'user_CustomerA'}})).status).toBe(400);
  expect((await request.post('/api/payments/webhook').send({event:'payment.captured'})).status).toBe(400);
});
test('Clerk sockets deny admin and foreign private rooms for a customer, then honor revocation',async()=>{
  const raw=token('user_SocketCustomer');
  const socket=io(server.baseUrl,{auth:{token:raw},transports:['websocket'],reconnection:false});sockets.push(socket);
  await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('connect_error',reject);});
  const join=(room:string)=>new Promise<any>(resolve=>socket.emit('join_room',room,resolve));
  expect((await join('admins')).ok).toBe(false);expect((await join('vendor_ven-1')).ok).toBe(false);expect((await join('user_usr-5')).ok).toBe(false);
  revoked.add('sess_SocketCustomer');
  const ended=new Promise<void>(resolve=>socket.once('disconnect',()=>resolve()));socket.emit('join_room','admins');await ended;expect(socket.connected).toBe(false);
});
test('logout revokes provider session and account switch never reuses it',async()=>{
  expect((await request.post('/api/auth/logout').set(header('user_Logout'))).status).toBe(200);
  await expect(resolveClerkSession(token('user_Logout'))).rejects.toMatchObject({status:401});
  expect((await request.get('/api/auth/profile').set(header('user_SwitchTo'))).status).toBe(200);
});

test('rider cannot read or complete another rider assignment',async()=>{
  await linkClerkIdentity('usr-4','user_Rider','test operator');
  await prisma.driverPartner.upsert({where:{userId:'usr-4'},create:{userId:'usr-4',name:'Synthetic Rider',phone:'9000000014',runnerCode:'SYNTHETIC-RIDER',vehicleType:'Cycle',approvalStatus:'APPROVED'},update:{approvalStatus:'APPROVED'}});
  const otherRider=await prisma.user.create({data:{clerkUserId:'user_OtherRider',name:'Synthetic other rider',role:'DRIVER'}});
  const order=await prisma.order.create({data:{customerId:'usr-1',vendorId:'ven-1',driverId:otherRider.id,totalAmount:50,dropoffHostel:'Synthetic delivery address',status:'PICKED_UP',paymentStatus:'PAID'}});
  expect((await request.get('/api/orders/'+order.id).set(header('user_Rider'))).status).toBe(404);
  // Existing privacy contract deliberately makes a foreign order indistinguishable from a missing one.
  expect((await request.post('/api/orders/'+order.id+'/verify-gate-otp').set(header('user_Rider')).send({otp:'1234'})).status).toBe(404);
  expect(await prisma.order.findUniqueOrThrow({where:{id:order.id}})).toMatchObject({driverId:otherRider.id,status:'PICKED_UP',otpAttempts:0});
});
test('Clerk mapped device tokens remain account owned and role isolated',async()=>{
  const device='synthetic-owned-fcm-device-'.padEnd(180,'x');
  expect((await request.post('/api/devices').set(header('user_DeviceA')).send({app:'CUSTOMER',token:device})).status).toBe(200);
  expect((await request.post('/api/devices').set(header('user_DeviceB')).send({app:'CUSTOMER',token:device})).status).toBe(409);
  expect((await request.post('/api/devices').set(header('user_DeviceA')).send({app:'DRIVER',token:device+'y'})).status).toBe(403);
});
test('linking two subjects to one existing UUID has one winner and preserves the winner',async()=>{
  const user=await prisma.user.create({data:{name:'Other synthetic customer'}});
  const outcomes=await Promise.allSettled([linkClerkIdentity(user.id,'user_ConcurrentA','approved fixture ticket'),linkClerkIdentity(user.id,'user_ConcurrentB','approved fixture ticket')]);
  expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);
  const stored=await prisma.user.findUniqueOrThrow({where:{id:user.id}});
  expect(['user_ConcurrentA','user_ConcurrentB']).toContain(stored.clerkUserId);
  const winner=outcomes.find(o=>o.status==='fulfilled') as PromiseFulfilledResult<any>;
  expect(stored.clerkUserId).toBe(winner.value.clerkUserId);
});
test('Clerk account deletion retains the internal UUID and blocks subsequent access',async()=>{
  const subject='user_DeleteCustomer';const session=await resolveClerkSession(token(subject));
  const response=await request.delete('/api/auth/account').set(header(subject));expect(response.status).toBe(200);
  const record=await prisma.user.findUniqueOrThrow({where:{id:session.id}});expect(record.deletedAt).not.toBeNull();expect(record.clerkUserId).toBe(subject);
  await expect(resolveClerkSession(token(subject))).rejects.toMatchObject({status:401});
});
