/** Real local HTTP/PostgreSQL and official Clerk signature verification; provider HTTP alone is synthetic. */
import {generateKeyPairSync,createHash} from 'crypto';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import {prisma} from '../harness/db';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
import {setClerkTestTransport} from '../../src/services/clerkIdentity';
import {__resetRateLimits} from '../../src/middleware/rateLimit';
const original={...process.env},issuer='https://rider-workflow.clerk.accounts.dev',party='https://admin.grozo.test';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const emails=new Map<string,string>(),unverified=new Set<string>();let providerLookups=0,server:TestServerInstance,request:ReturnType<typeof supertest>;
const sid=(subject:string)=>'sess_'+subject.slice(5);
const auth=(subject='user_WorkflowAdmin')=>({Authorization:'Bearer '+jwt.sign({sub:subject,sid:sid(subject),iss:issuer,azp:party,aud:'rider-workflow',v:2,sts:'active'},privateKey,{algorithm:'RS256',expiresIn:'5m'})});
const email=(name:string)=>name+'@rider-workflow.invalid';
const account=async(subject:string,address:string)=>{emails.set(subject,address);return request.get('/api/auth/profile').set(auth(subject));};
const invite=async(address:string)=>{const r=await request.post('/api/v1/admin/rider-invitations').set(auth()).send({email:address,consentConfirmed:true});expect(r.status).toBe(201);return r.body.data;};
const tokenOf=(row:{inviteUrl:string})=>new URLSearchParams(new URL(row.inviteUrl).hash.slice(1)).get('invite')!;
jest.setTimeout(60000);
beforeAll(async()=>{
 Object.assign(process.env,{AUTH_MODE:'clerk-test',ADMIN_URL:party,CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from('rider-workflow.clerk.accounts.dev$').toString('base64'),CLERK_SECRET_KEY:'sk_test_local_provider_http_fixture_only',CLERK_JWT_KEY:publicKey.export({type:'spki',format:'pem'}).toString(),CLERK_ISSUER:issuer,CLERK_AUTHORIZED_PARTIES:party,CLERK_AUDIENCE:'rider-workflow',CLERK_ADMIN_USER_IDS:'user_WorkflowAdmin'});
 emails.set('user_WorkflowAdmin',email('operator'));
 setClerkTestTransport({user:async id=>({id,banned:false,firstName:'Synthetic',emailAddresses:[{emailAddress:emails.get(id)||email('unknown'),verification:{status:unverified.has(id)?'unverified':'verified'}}]}),session:async id=>({id,userId:'user_'+id.slice(5),status:'active'}),deleteUser:async()=>({}),revoke:async()=>({}),usersByEmail:async address=>{providerLookups++;return [...emails].filter(([,e])=>e===address).map(([id,e])=>({id,banned:false,emailAddresses:[{emailAddress:e,verification:{status:unverified.has(id)?'unverified':'verified'}}]}));}});
 const admin=await prisma.user.create({data:{clerkUserId:'user_WorkflowAdmin',name:'Synthetic rider operator',role:'ADMIN'}});
 await prisma.adminAccess.create({data:{userId:admin.id,clerkUserId:'user_WorkflowAdmin',role:'OWNER',status:'ACTIVE'}});
 await prisma.city.create({data:{id:'rider-workflow-city',code:'rider-workflow',name:'Synthetic city',state:'Karnataka',active:true}});
 await prisma.deliveryZone.create({data:{id:'rider-workflow-zone',cityId:'rider-workflow-city',name:'Synthetic zone',active:true,centerLat:12.96,centerLng:77.58,radiusKm:3,baseFeePaise:2500}});
 server=await startTestServer();request=supertest(server.app);
});
afterEach(()=>{delete process.env.RL_RIDER_IDENTITY_CHECK_MAX;__resetRateLimits();});
afterAll(async()=>{
 await stopTestServer(server);setClerkTestTransport(null);
 await prisma.riderInvitation.deleteMany({where:{email:{endsWith:'@rider-workflow.invalid'}}});
 await prisma.order.deleteMany({where:{customer:{clerkUserId:{startsWith:'user_Workflow'}}}});
 await prisma.vendor.deleteMany({where:{id:'rider-workflow-store'}});
 await prisma.driverPartner.deleteMany({where:{user:{clerkUserId:{startsWith:'user_Workflow'}}}});
 await prisma.adminAccess.deleteMany({where:{clerkUserId:{startsWith:'user_Workflow'}}});
 await prisma.user.deleteMany({where:{clerkUserId:{startsWith:'user_Workflow'}}});
 await prisma.deliveryZone.delete({where:{id:'rider-workflow-zone'}});await prisma.city.delete({where:{id:'rider-workflow-city'}});
 for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);await prisma.$disconnect();
});
test('identity enumeration is denied to anonymous and customer callers; unknown/unverified account yields 409 before creation',async()=>{
 const before=providerLookups;
 expect((await request.post('/api/v1/admin/riders/eligibility').send({email:email('new')})).status).toBe(401);
 await account('user_WorkflowCustomer',email('customer'));
 expect((await request.post('/api/v1/admin/riders/eligibility').set(auth('user_WorkflowCustomer')).send({email:email('new')})).status).toBe(403);expect(providerLookups).toBe(before);
 expect((await request.post('/api/v1/admin/riders/eligibility').set(auth()).send({email:email('new')})).body).toMatchObject({code:'PARTNER_ACCOUNT_REQUIRED',field:'email'});
 emails.set('user_WorkflowUnverified',email('unverified'));unverified.add('user_WorkflowUnverified');
 expect((await request.post('/api/v1/admin/riders/eligibility').set(auth()).send({email:email('unverified')})).status).toBe(409);
});
test('manual invitation requires consent, is hashed/expiring and grants neither a role nor a rider profile',async()=>{
 expect((await request.post('/api/v1/admin/rider-invitations').set(auth()).send({email:email('consenting')})).status).toBe(400);
 const row=await invite(email('consenting')),token=tokenOf(row),saved=await prisma.riderInvitation.findUniqueOrThrow({where:{id:row.id}});
 expect(row.delivery).toEqual({mode:'MANUAL',sent:false});expect(row.tokenHash).toBeUndefined();expect(saved.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
 expect(saved.expiresAt.getTime()-Date.now()).toBeGreaterThan(71*3600000);expect(await prisma.driverPartner.count({where:{user:{clerkUserId:'user_WorkflowConsenting'}}})).toBe(0);
 expect((await request.post('/api/v1/admin/rider-invitations').set(auth()).send({email:row.email,consentConfirmed:true})).body.code).toBe('INVITATION_PENDING');
});
test('only the intended verified identity redeems once; operator linking starts pending/offline and consumes the invitation',async()=>{
 await account('user_WorkflowRider',email('rider'));await account('user_WorkflowOther',email('other'));
 const row=await invite(email('rider')),token=tokenOf(row),path='/api/v1/partner/rider-invitations/redeem';
 expect((await request.post(path).set(auth('user_WorkflowOther')).send({token})).status).toBe(403);
 const verified=await request.post(path).set(auth('user_WorkflowRider')).send({token});expect(verified.body.data).toMatchObject({verified:true,approvalGranted:false});
 expect((await request.post(path).set(auth('user_WorkflowRider')).send({token})).body.data.alreadyVerified).toBe(true);
 const user=await prisma.user.findUniqueOrThrow({where:{clerkUserId:'user_WorkflowRider'}});expect(user.role).toBe('STUDENT');
 expect((await request.post('/api/v1/admin/riders/eligibility').set(auth()).send({email:email('rider')})).body.data.eligible).toBe(true);
 const data={email:email('rider'),name:'Synthetic Rider',phone:'9000000881',vehicleType:'Bike',vehicleRegNo:'KA01QA1234',cityId:'rider-workflow-city',zoneId:'rider-workflow-zone',approve:false};
 const linked=await request.post('/api/v1/admin/riders').set(auth()).send(data);expect(linked.status).toBe(201);expect(linked.body.data).toMatchObject({approvalStatus:'PENDING',dutyStatus:'OFFLINE'});
 expect((await prisma.riderInvitation.findUniqueOrThrow({where:{id:row.id}})).state).toBe('COMPLETED');
 expect((await request.post('/api/v1/admin/riders').set(auth()).send(data)).body.code).toBe('RIDER_EXISTS');
 expect((await request.post(path).set(auth('user_WorkflowRider')).send({token})).status).toBe(410);
});
test('expired or revoked links and customer history cannot promote an account',async()=>{
 await account('user_WorkflowBlocked',email('blocked'));const row=await invite(email('blocked')),token=tokenOf(row);
 await prisma.riderInvitation.update({where:{id:row.id},data:{expiresAt:new Date(0)}});
 expect((await request.post('/api/v1/partner/rider-invitations/redeem').set(auth('user_WorkflowBlocked')).send({token})).status).toBe(410);
 const other=await invite(email('blocked'));expect((await request.delete('/api/v1/admin/rider-invitations/'+other.id).set(auth())).status).toBe(200);
 expect((await request.post('/api/v1/partner/rider-invitations/redeem').set(auth('user_WorkflowBlocked')).send({token:tokenOf(other)})).status).toBe(410);
 const user=await prisma.user.findUniqueOrThrow({where:{clerkUserId:'user_WorkflowBlocked'}});
 await prisma.vendor.create({data:{id:'rider-workflow-store',name:'Synthetic history store',category:'Test',address:'Synthetic fixture',bannerImage:''}});
 await prisma.order.create({data:{customerId:user.id,vendorId:'rider-workflow-store',totalAmount:10,dropoffHostel:'Synthetic historical address'}});
 const response=await request.post('/api/v1/admin/riders/eligibility').set(auth()).send({email:email('blocked')});expect(response.body.code).toBe('CUSTOMER_HISTORY_CONFLICT');expect((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).role).toBe('STUDENT');
});
test('real rate limiting returns 429 with Retry-After and does not repeat the provider lookup',async()=>{
 await account('user_WorkflowRate',email('rate'));process.env.RL_RIDER_IDENTITY_CHECK_MAX='1';const before=providerLookups;
 const call=()=>request.post('/api/v1/admin/riders/eligibility').set(auth()).send({email:email('rate')});expect((await call()).status).toBe(200);
 const limited=await call();expect(limited.status).toBe(429);expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);expect(providerLookups-before).toBe(1);
});
