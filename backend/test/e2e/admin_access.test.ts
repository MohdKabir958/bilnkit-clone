/** Real PostgreSQL and official Clerk signature/middleware checks; provider HTTP is an explicit fixture. */
import {generateKeyPairSync,createHmac} from 'crypto';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import {io,Socket} from 'socket.io-client';
import {prisma} from '../harness/db';
import {synchronizeAdminAccess} from '../../src/services/adminAccess';
import {__resetRateLimits} from '../../src/middleware/rateLimit';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
import {setClerkTestTransport,ProviderUser} from '../../src/services/clerkIdentity';

const original={...process.env},issuer='https://rbac-fixture.clerk.accounts.dev',party='https://admin.rbac.test';
const webhookBytes=Buffer.from('local-admin-deletion-webhook-fixture-only');
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const people=new Map<string,ProviderUser>(),sessions=new Map<string,string>();
let server:TestServerInstance,request:ReturnType<typeof supertest>;
const sockets:Socket[]=[];
const owner='user_RbacOwner',city='rbac-qa-city',otherCity='rbac-qa-other-city';
function identity(subject:string,email:string,verified=true){people.set(subject,{id:subject,banned:false,firstName:'Rbac',lastName:subject,emailAddresses:[{id:'email_'+subject,emailAddress:email,verification:{status:verified?'verified':'unverified'}}]});}
function auth(subject=owner,claims:Record<string,unknown>={}){const sid='sess_'+subject;sessions.set(sid,subject);return {Authorization:'Bearer '+jwt.sign({iss:issuer,azp:party,sub:subject,sid,sts:'active',v:2,...claims},keys.privateKey,{algorithm:'RS256',expiresIn:'5m',keyid:'rbac-test-key'}),Origin:party};}
async function invite(email:string,role='ADMIN'){const r=await request.post('/api/v1/admin/team').set(auth()).send({email,role});expect(r.status).toBe(201);return r.body.data;}
async function member(subject:string,email:string,role='ADMIN') {identity(subject,email);const grant=await invite(email,role);const r=await request.get('/api/auth/profile').set(auth(subject));expect(r.status).toBe(200);expect(r.body.user.role).toBe('ADMIN');return grant;}
beforeAll(async()=>{
  Object.assign(process.env,{AUTH_MODE:'clerk-test',CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from('rbac-fixture.clerk.accounts.dev$').toString('base64'),CLERK_SECRET_KEY:'sk_test_explicit_fixture_not_a_provider_credential',CLERK_JWT_KEY:keys.publicKey.export({type:'spki',format:'pem'}).toString(),CLERK_ISSUER:issuer,CLERK_AUTHORIZED_PARTIES:party,CLERK_ADMIN_USER_IDS:owner,CLERK_ALLOW_NATIVE_WITHOUT_AZP:'false',CLERK_WEBHOOK_SIGNING_SECRET:'whsec_'+webhookBytes.toString('base64')});
  delete process.env.CLERK_AUDIENCE;
  setClerkTestTransport({user:async id=>{const u=people.get(id);if(!u)throw Object.assign(Error('fixture missing'),{status:404});return u;},session:async id=>({id,userId:sessions.get(id)!,status:'active'}),revoke:async()=>{},deleteUser:async()=>{},usersByEmail:async email=>[...people.values()].filter(u=>u.emailAddresses?.some(e=>e.emailAddress.toLowerCase()===email))});
  identity(owner,'owner@team-test.invalid');
  await prisma.user.create({data:{name:'Rbac initial owner',clerkUserId:owner,role:'ADMIN'}});
  await prisma.city.create({data:{id:city,code:city,name:'Bengaluru QA',state:'Karnataka',active:true}});
  await prisma.city.create({data:{id:otherCity,code:otherCity,name:'Other QA city',state:'Karnataka',active:true}});
  await prisma.deliveryZone.create({data:{id:'rbac-qa-zone',cityId:city,name:'QA zone',centerLat:12.96393155,centerLng:77.58425661,radiusKm:8,active:true}});
  await prisma.deliveryZone.create({data:{id:'rbac-qa-other-zone',cityId:otherCity,name:'Other QA zone',centerLat:12.96393155,centerLng:77.58425661,radiusKm:8,active:true}});
  server=await startTestServer();request=supertest(server.app);
});
afterAll(async()=>{
  sockets.forEach(s=>s.disconnect());if(server)await stopTestServer(server);setClerkTestTransport(null);
  const users=await prisma.user.findMany({where:{OR:[{clerkUserId:{startsWith:'user_Rbac'}},{name:{startsWith:'Rbac '}}]},select:{id:true}}),ids=users.map(u=>u.id);
  const grants=await prisma.adminAccess.findMany({where:{OR:[{email:{endsWith:'@team-test.invalid'}},{clerkUserId:{startsWith:'user_Rbac'}}]},select:{id:true}});
  await prisma.adminAccess.deleteMany({where:{id:{in:grants.map(g=>g.id)}}});
  const stores=await prisma.vendor.findMany({where:{cityId:{in:[city,otherCity]}},select:{id:true}}),storeIds=stores.map(v=>v.id);
  await prisma.order.deleteMany({where:{vendorId:{in:storeIds}}});await prisma.vendor.deleteMany({where:{id:{in:storeIds}}});
  await prisma.deliveryZone.deleteMany({where:{cityId:{in:[city,otherCity]}}});await prisma.city.deleteMany({where:{id:{in:[city,otherCity]}}});
  await prisma.adminAuditLog.deleteMany({where:{targetId:{in:[...ids,...storeIds,...grants.map(g=>g.id)]}}});await prisma.user.deleteMany({where:{id:{in:ids}}});
  for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);await prisma.$disconnect();
});

test('an existing provisioned allowlisted admin bootstraps as owner once',async()=>{
  const r=await request.get('/api/auth/profile').set(auth());expect(r.status).toBe(200);expect(r.body.user.adminRole).toBe('OWNER');
  expect((await request.get('/api/v1/admin/team').set(auth())).status).toBe(200);
  expect(await prisma.adminAccess.count({where:{clerkUserId:owner}})).toBe(1);
});
test('missing, invalid or ordinary customer identity cannot invite an admin',async()=>{
  expect((await request.post('/api/v1/admin/team').send({email:'bad@team-test.invalid'})).status).toBe(401);
  expect((await request.get('/api/v1/admin/team').set('Authorization','Bearer forged')).status).toBe(401);
  identity('user_RbacOrdinary','ordinary@team-test.invalid');
  expect((await request.post('/api/v1/admin/team').set(auth('user_RbacOrdinary',{role:'ADMIN',public_metadata:{role:'OWNER'}})).send({email:'bad@team-test.invalid'})).status).toBe(403);
});
test('email grants are normalized, pending and never sent as automatic email messages',async()=>{
  const grant=await invite(' New.Member@team-test.invalid ');expect(grant.email).toBe('new.member@team-test.invalid');expect(grant.status).toBe('INVITED');
  expect((await request.post('/api/v1/admin/team').set(auth()).send({email:'NEW.MEMBER@team-test.invalid',role:'OWNER'})).status).toBe(409);
  expect((await request.post('/api/v1/admin/team').set(auth()).send({email:'not-an-email'})).status).toBe(400);
});
test('unverified email and token metadata cannot redeem a grant',async()=>{
  await invite('unverified@team-test.invalid');identity('user_RbacUnverified','unverified@team-test.invalid',false);
  const r=await request.get('/api/auth/profile').set(auth('user_RbacUnverified',{email:'unverified@team-test.invalid',email_verified:true,role:'ADMIN'}));
  expect(r.body.user.role).toBe('STUDENT');expect((await prisma.adminAccess.findUniqueOrThrow({where:{email:'unverified@team-test.invalid'}})).status).toBe('INVITED');
});
test('verified email activates only its explicit role and preserves unrelated email-matching business IDs',async()=>{
  const old=await prisma.user.create({data:{name:'Rbac historical customer',email:'accepted@team-test.invalid',kraveoCoins:321}});
  await member('user_RbacAccepted','accepted@team-test.invalid');
  const profile=await request.get('/api/auth/profile').set(auth('user_RbacAccepted',{role:'OWNER'}));
  expect(profile.body.user.adminRole).toBe('ADMIN');expect(profile.body.user.id).not.toBe(old.id);
  expect((await prisma.user.findUniqueOrThrow({where:{id:old.id}})).kraveoCoins).toBe(321);
  expect((await request.get('/api/v1/admin/team').set(auth('user_RbacAccepted'))).status).toBe(403);
  expect((await request.get('/api/admin/partners').set(auth('user_RbacAccepted'))).status).toBe(200);
});
test('administrator access no longer requires adding each subject to Render',async()=>{
  expect(process.env.CLERK_ADMIN_USER_IDS).not.toContain('user_RbacAccepted');
  expect((await request.get('/api/admin/partners').set(auth('user_RbacAccepted'))).status).toBe(200);
});
test('an administrator cannot invite, promote or revoke another member',async()=>{
  const own=await prisma.adminAccess.findUniqueOrThrow({where:{clerkUserId:'user_RbacAccepted'}});
  for(const action of ['post','patch','delete'] as const){const target=action==='post'?'/api/v1/admin/team':'/api/v1/admin/team/'+own.id;const r=await request[action](target).set(auth('user_RbacAccepted')).send({email:'escalate@team-test.invalid',role:'OWNER'});expect(r.status).toBe(403);}
});
test('last owner cannot revoke or demote their own access',async()=>{
  const own=await prisma.adminAccess.findUniqueOrThrow({where:{clerkUserId:owner}});
  expect((await request.patch('/api/v1/admin/team/'+own.id).set(auth()).send({role:'ADMIN'})).body.code).toBe('LAST_OWNER');
  expect((await request.delete('/api/v1/admin/team/'+own.id).set(auth())).body.code).toBe('LAST_OWNER');
});
test('an active grant cannot be stolen by another subject reusing its email',async()=>{
  identity('user_RbacDifferentIdentity','accepted@team-test.invalid');
  const r=await request.get('/api/auth/profile').set(auth('user_RbacDifferentIdentity'));expect(r.body.user.role).toBe('STUDENT');
});
test('partner identities cannot accept administrator invitations',async()=>{
  identity('user_RbacPartner','partner@team-test.invalid');await prisma.user.create({data:{name:'Rbac existing driver',clerkUserId:'user_RbacPartner',role:'DRIVER'}});
  await invite('partner@team-test.invalid');expect((await request.get('/api/auth/profile').set(auth('user_RbacPartner'))).status).toBe(409);
});
test('owner can promote another owner, then revocation denies REST and disconnects private sockets',async()=>{
  const grant=await member('user_RbacRevoked','revoked@team-test.invalid');
  expect((await request.patch('/api/v1/admin/team/'+grant.id).set(auth()).send({role:'OWNER'})).status).toBe(200);
  const raw=auth('user_RbacRevoked').Authorization.slice(7),socket=io(server.baseUrl,{auth:{token:raw},extraHeaders:{Origin:party},transports:['websocket'],reconnection:false});sockets.push(socket);
  await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('connect_error',reject);});
  expect(await new Promise<any>(resolve=>socket.emit('join_room','admins',resolve))).toMatchObject({ok:true});
  expect((await request.delete('/api/v1/admin/team/'+grant.id).set(auth())).status).toBe(200);
  expect((await request.get('/api/admin/partners').set(auth('user_RbacRevoked'))).status).toBe(403);
  const ended=new Promise<void>(resolve=>socket.once('disconnect',()=>resolve()));socket.emit('join_room','admins');await ended;expect(socket.connected).toBe(false);
  expect(await prisma.adminAuditLog.count({where:{targetId:grant.id,action:'ADMIN_ACCESS_REVOKED'}})).toBe(1);
});
test('new stores validate city, pickup and zone, and start closed without a generated password',async()=>{
  const body={name:'Rbac grocery store',cityId:city,address:'QA simulated pickup, Town Hall',locality:'Town Hall',pinCode:'560002',lat:12.96393155,lng:77.58425661,zoneId:'rbac-qa-zone'};
  expect((await request.post('/api/v1/admin/stores').set(auth()).send({...body,lat:0})).status).toBe(400);
  expect((await request.post('/api/v1/admin/stores').set(auth()).send({...body,zoneId:'rbac-qa-other-zone'})).status).toBe(400);
  const r=await request.post('/api/v1/admin/stores').set(auth()).send(body);expect(r.status).toBe(201);expect(r.body.data.isAcceptingOrders).toBe(false);expect(r.body.data.userId).toBeNull();
  expect(await prisma.vendorCoverage.count({where:{vendorId:r.body.data.id,zoneId:'rbac-qa-zone'}})).toBe(1);
});
test('owner email assignment verifies Clerk ownership, preserves UUID, and refuses an unverified partner',async()=>{
  identity('user_RbacStoreOwner','store-owner@team-test.invalid');const first=await request.get('/api/auth/profile').set(auth('user_RbacStoreOwner'));
  identity('user_RbacStoreUnverified','store-unverified@team-test.invalid',false);
  const body={name:'Rbac owned store',cityId:city,address:'QA simulated pickup',locality:'Town Hall',pinCode:'560002',lat:12.96393155,lng:77.58425661};
  expect((await request.post('/api/v1/admin/stores').set(auth()).send({...body,ownerEmail:'store-unverified@team-test.invalid'})).status).toBe(409);
  const r=await request.post('/api/v1/admin/stores').set(auth()).send({...body,ownerEmail:'store-owner@team-test.invalid'});expect(r.status).toBe(201);expect(r.body.data.userId).toBe(first.body.user.id);
  expect((await prisma.user.findUniqueOrThrow({where:{id:first.body.user.id}})).role).toBe('VENDOR');
});
test('city order filtering is enforced in the server query and survives pagination',async()=>{
  const customer=await prisma.user.create({data:{name:'Rbac city filter customer'}});
  const a=await prisma.vendor.findFirstOrThrow({where:{cityId:city}}),b=await prisma.vendor.create({data:{name:'Rbac other city store',cityId:otherCity,category:'Groceries',bannerImage:'',address:'QA only'}});
  for(const [index,v]of [a,b,a].entries())await prisma.order.create({data:{id:`rbac-qa-order-${index}`,customerId:customer.id,vendorId:v.id,totalAmount:100,dropoffHostel:'Simulated test address'}});
  const first=await request.get('/api/orders').query({cityId:city,limit:1}).set(auth());expect(first.status).toBe(200);expect(first.body.data).toHaveLength(1);expect(first.body.data[0].vendorId).toBe(a.id);expect(first.body.nextCursor).toBeTruthy();
  const second=await request.get('/api/orders').query({cityId:city,limit:1,cursor:first.body.nextCursor}).set(auth());expect(second.body.data).toHaveLength(1);expect(second.body.data[0].vendorId).toBe(a.id);expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
});
test('verified provider deletion anonymizes team contact data while retaining UUID/audit tombstones',async()=>{
  const subject='user_RbacProviderDeleted',grant=await member(subject,'provider-deleted@team-test.invalid');
  const before=await prisma.user.findUniqueOrThrow({where:{clerkUserId:subject}});
  const id='msg_admin_deletion_fixture',timestamp=Math.floor(Date.now()/1000).toString();
  const body=JSON.stringify({type:'user.deleted',timestamp:Date.now(),data:{id:subject,deleted:true}});
  const signature=createHmac('sha256',webhookBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  const r=await request.post('/api/webhooks/clerk').set({'Content-Type':'application/json','svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${signature}`}).send(body);expect(r.status).toBe(200);
  expect(await prisma.adminAccess.findUniqueOrThrow({where:{id:grant.id}})).toMatchObject({userId:before.id,clerkUserId:subject,email:null,displayName:null,status:'REVOKED'});
  expect((await prisma.user.findUniqueOrThrow({where:{id:before.id}})).deletedAt).not.toBeNull();
  expect((await request.get('/api/auth/profile').set(auth(subject))).status).toBe(401);
});
test('a removed administrator deleting their customer account clears the retained directory contact fields',async()=>{
  const subject='user_RbacAccountDeleted',grant=await member(subject,'account-deleted@team-test.invalid');
  expect((await request.delete('/api/v1/admin/team/'+grant.id).set(auth())).status).toBe(200);
  expect((await request.delete('/api/auth/account').set(auth(subject))).status).toBe(200);
  expect(await prisma.adminAccess.findUniqueOrThrow({where:{id:grant.id}})).toMatchObject({email:null,displayName:null,status:'REVOKED'});
});
test('activation rechecks partner role under lock when an earlier customer snapshot is stale',async()=>{
  const subject='user_RbacStaleRole',email='stale-role@team-test.invalid';identity(subject,email);
  const earlier=await prisma.user.create({data:{name:'Rbac stale role',clerkUserId:subject,role:'STUDENT'}});
  await invite(email);await prisma.user.update({where:{id:earlier.id},data:{role:'DRIVER'}});
  await expect(synchronizeAdminAccess(earlier,people.get(subject)!)).rejects.toMatchObject({status:409,code:'PARTNER_ROLE_CONFLICT'});
  expect((await prisma.user.findUniqueOrThrow({where:{id:earlier.id}})).role).toBe('DRIVER');
  expect((await prisma.adminAccess.findUniqueOrThrow({where:{email}})).status).toBe('INVITED');
});
test('team and store write limits match normalized versioned routes including case and trailing slash',async()=>{
  __resetRateLimits();process.env.RL_ADMIN_TEAM_WRITE_MAX='2';process.env.RL_ADMIN_STORE_CREATE_MAX='2';
  try {
    for(const path of ['/api/v1/admin/team','/api/V1/ADMIN/TEAM/'])expect((await request.post(path).set(auth()).send({email:'invalid'})).status).toBe(400);
    const limited=await request.post('/api/v1/admin/team').set(auth()).send({email:'invalid'});expect(limited.status).toBe(429);expect(limited.headers['retry-after']).toBeTruthy();
    for(const path of ['/api/v1/admin/stores','/api/V1/ADMIN/STORES/'])expect((await request.post(path).set(auth()).send({})).status).toBe(400);
    expect((await request.post('/api/v1/admin/stores').set(auth()).send({})).status).toBe(429);
  } finally {delete process.env.RL_ADMIN_TEAM_WRITE_MAX;delete process.env.RL_ADMIN_STORE_CREATE_MAX;__resetRateLimits();}
});
test('concurrent owner demotions cannot remove the final owner',async()=>{
  const second=await member('user_RbacSecondOwner','second-owner@team-test.invalid','OWNER');
  const first=await prisma.adminAccess.findUniqueOrThrow({where:{clerkUserId:owner}});
  const responses=await Promise.all([request.patch('/api/v1/admin/team/'+first.id).set(auth()).send({role:'ADMIN'}),request.patch('/api/v1/admin/team/'+second.id).set(auth('user_RbacSecondOwner')).send({role:'ADMIN'})]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  expect(await prisma.adminAccess.count({where:{role:'OWNER',status:'ACTIVE',user:{deletedAt:null,role:'ADMIN'}}})).toBe(1);
});
