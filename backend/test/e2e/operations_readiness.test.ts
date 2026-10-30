import fs from 'fs';
import path from 'path';
import {randomUUID} from 'crypto';
import supertest from 'supertest';
import {prisma} from '../harness/db';
import {createWorld,resetWorldState,purgeWorld,createApi,World,Api} from '../harness/journey';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
import {makePng} from '../harness/images';
import {cashBusinessDate} from '../../src/services/cashReconciliation';
import {escalateOverdueSupportCases} from '../../src/services/supportCases';
import {purgeExpiredSupportEvidence,supportEvidenceDir} from '../../src/services/supportEvidence';
import {generateToken} from '../../src/middleware/auth';

jest.setTimeout(60000);
describe('Production operations: immutable cash, structured support and safe exception ownership',()=>{
 let server:TestServerInstance,W:World,api:Api,dir:string;const tag='opsready';let other:{id:string;token:string};
 const raw=(who:{token:string},method:string,url:string,body?:object)=>api.raw('opsready',method as any,url,who.token,body);
 const clean=async()=>{
  if(process.env.NODE_ENV!=='test'||!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))throw Error('Disposable test database only.');
  // Append-only production evidence is never weakened for tests. Reset only the isolated test tables.
  await prisma.$executeRawUnsafe('TRUNCATE "CashLedgerEvent", "CashDailyClose", "OperationalResolution"');
  await prisma.cashCollection.deleteMany({where:{driverUserId:{startsWith:tag+'-'}}});
 };
 const support=async()=>{const r=await raw(W.customers[0],'post','/api/v1/support-cases',{subject:'Missing product',description:'The sealed grocery bag is missing one product.',category:'MISSING_ITEM'});expect(r.status).toBe(201);return r.body.data.id as string;};
 const cash=async(amountPaise=12345)=>{const order=await prisma.order.create({data:{customerId:W.customers[0].id,vendorId:W.vendors[0].vendorId,driverId:W.riders[0].id,totalAmount:amountPaise/100,dropoffHostel:'Saved demo address',status:'DELIVERED',workflowVersion:2,paymentMethod:'COD',paymentStatus:'PAID',deliveredAt:new Date()}});return prisma.cashCollection.create({data:{orderId:order.id,driverUserId:W.riders[0].id,amountPaise}});};
 beforeAll(async()=>{server=await startTestServer();dir=fs.mkdtempSync('/tmp/grozo-support-');process.env.SUPPORT_EVIDENCE_DIR=path.join(dir,'private');W=await createWorld(tag,'9',{customers:2,vendors:1,riders:1});api=createApi(server.baseUrl);other={id:tag+'-supervisor',token:generateToken({id:tag+'-supervisor',role:'ADMIN'})};await prisma.user.create({data:{id:other.id,name:'Independent supervisor',role:'ADMIN'}});});
 beforeEach(async()=>{await clean();await resetWorldState(W);});
 afterAll(async()=>{await clean();await purgeWorld(tag);await stopTestServer(server);delete process.env.SUPPORT_EVIDENCE_DIR;fs.rmSync(dir,{recursive:true,force:true});await prisma.$disconnect();});
 test('support categories are structured, account-owned and client privilege fields are refused',async()=>{
  expect((await raw(W.customers[0],'post','/api/v1/support-cases',{subject:'Wrong owner',description:'A legitimate description.',category:'MISSING_ITEM',assignedToId:W.admin.id,priority:'URGENT'})).status).toBe(400);
  expect((await raw(W.customers[0],'post','/api/v1/support-cases',{subject:'Bad category',description:'A legitimate description.',category:'HACKED'})).status).toBe(400);
  const id=await support();const row=await prisma.supportCase.findUniqueOrThrow({where:{id}});expect(row.category).toBe('MISSING_ITEM');expect(row.dueAt!.getTime()).toBeGreaterThan(Date.now());
  expect((await raw(W.customers[1],'get',`/api/v1/support-cases/${id}`)).status).toBe(404);
  expect((await raw(W.vendors[0],'post',`/api/v1/support-cases/${id}/replies`,{message:'Cannot impersonate the requester'})).status).toBe(404);
  expect((await raw(W.customers[0],'post',`/api/v1/admin/support-cases/${id}/notes`,{status:'RESOLVED',message:'I approve my own refund'})).status).toBe(403);
 });
 test('internal notes stay private even with pagination; owner assignment requires an active administrator',async()=>{
  const id=await support();
  expect((await raw(W.admin,'post',`/api/v1/admin/support-cases/${id}/notes`,{status:'IN_PROGRESS',message:'Internal fraud review details',internal:true,priority:'HIGH',assignedToId:W.admin.id})).status).toBe(200);
  expect((await raw(W.admin,'post',`/api/v1/admin/support-cases/${id}/notes`,{status:'IN_PROGRESS',message:'We are reviewing the missing item.'})).status).toBe(200);
  const own=await raw(W.customers[0],'get',`/api/v1/support-cases/${id}?limit=1`);expect(own.status).toBe(200);expect(JSON.stringify(own.body)).not.toContain('Internal fraud');expect(own.body.data.assigned).toBe(true);expect(own.body.data).not.toHaveProperty('assignedToId');expect(own.body.data.notes).toHaveLength(1);
  const denied=await raw(W.admin,'post',`/api/v1/admin/support-cases/${id}/notes`,{status:'IN_PROGRESS',message:'This must roll back with invalid owner',assignedToId:W.customers[1].id});expect(denied.status).toBe(400);expect(await prisma.supportNote.count({where:{caseId:id}})).toBe(2);
  const list=await raw(W.customers[0],'get','/api/v1/support-cases');expect(JSON.stringify(list.body)).not.toContain('Internal fraud');
 });
 test('resolutions are requester-visible, reopen preserves the thread and overdue escalation is idempotent',async()=>{
  const id=await support();
  expect((await raw(W.admin,'post',`/api/v1/admin/support-cases/${id}/notes`,{status:'RESOLVED',message:'The item will be replaced.',internal:true})).status).toBe(400);
  expect((await raw(W.admin,'post',`/api/v1/admin/support-cases/${id}/notes`,{status:'RESOLVED',message:'The item will be replaced.',replacementReference:'replacement-demo-001'})).status).toBe(200);
  expect((await raw(W.customers[0],'post',`/api/v1/support-cases/${id}/replies`,{message:'The replacement has not arrived.'})).status).toBe(200);
  const row=await prisma.supportCase.findUniqueOrThrow({where:{id}});expect(row.status).toBe('OPEN');expect(row.reopenedAt).not.toBeNull();
  await prisma.supportCase.update({where:{id},data:{dueAt:new Date(Date.now()-1)}});expect(await escalateOverdueSupportCases()).toBe(1);expect(await escalateOverdueSupportCases()).toBe(0);expect(await prisma.adminAuditLog.count({where:{targetId:id,action:'SUPPORT_CASE_OVERDUE'}})).toBe(1);
 });
 test('evidence is magic-byte validated, private to its case and expires without a public media URL',async()=>{
  const id=await support(),photo=makePng(300,300);
  const upload=(who:{token:string},buffer=photo)=>supertest(server.app).post(`/api/v1/support-cases/${id}/evidence?caption=Sealed%20bag`).set('Authorization',`Bearer ${who.token}`).set('Content-Type','image/png').send(buffer);
  expect((await upload(W.customers[1])).status).toBe(404);expect((await upload(W.customers[0],Buffer.from('<svg/>'))).status).toBe(415);
  expect((await upload(W.customers[0],makePng(5000,100))).status).toBe(400);
  const attached=await upload(W.customers[0]);expect(attached.status).toBe(201);expect(attached.body.data).not.toHaveProperty('storageKey');const evidenceId=attached.body.data.id;
  const endpoint=`/api/v1/support-cases/${id}/evidence/${evidenceId}`;
  expect((await supertest(server.app).get(endpoint)).status).toBe(401);expect((await raw(W.customers[1],'get',endpoint)).status).toBe(404);expect((await raw(W.vendors[0],'get',endpoint)).status).toBe(404);
  const read=await supertest(server.app).get(endpoint).set('Authorization',`Bearer ${W.customers[0].token}`);expect(read.status).toBe(200);expect(read.headers['cache-control']).toBe('private, no-store');expect(read.body.equals(photo)).toBe(true);
  expect((await supertest(server.app).get(endpoint).set('Authorization',`Bearer ${W.admin.token}`)).status).toBe(200);
  const saved=await prisma.supportEvidence.findUniqueOrThrow({where:{id:evidenceId}});expect(fs.existsSync(path.join(supportEvidenceDir(),saved.storageKey))).toBe(true);
  expect((await supertest(server.app).get(`/uploads/${saved.storageKey}`)).status).toBe(404);
  await prisma.supportEvidence.update({where:{id:evidenceId},data:{expiresAt:new Date(Date.now()-1)}});expect((await raw(W.customers[0],'get',endpoint)).status).toBe(404);expect(await purgeExpiredSupportEvidence()).toBe(1);expect(fs.existsSync(path.join(supportEvidenceDir(),saved.storageKey))).toBe(false);
 });
 test('private evidence storage inside the public image tree is rejected',async()=>{
  const previous=process.env.SUPPORT_EVIDENCE_DIR;process.env.SUPPORT_EVIDENCE_DIR=path.join(process.env.UPLOAD_DIR||'./var/uploads','support');try{expect(()=>supportEvidenceDir()).toThrow('separate from public');}finally{process.env.SUPPORT_EVIDENCE_DIR=previous;}
 });
 test('partial cash receipt is exact, retries are idempotent and over-receipt/fraud cannot forgive debt',async()=>{
  const row=await cash();const input={kind:'PLATFORM_RECEIPT',amountPaise:2345,reference:'physical-receipt-001',reason:'Counted cash received at desk',idempotencyKey:randomUUID()};
  expect((await raw(W.riders[0],'post',`/api/v1/admin/cash/${row.id}/evidence`,input)).status).toBe(403);
  const responses=await Promise.all(Array.from({length:4},()=>raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/evidence`,input)));expect(responses.every(r=>r.status===200)).toBe(true);expect(await prisma.cashLedgerEvent.count({where:{collectionId:row.id}})).toBe(1);
  const balance=await raw(W.admin,'get',`/api/v1/admin/riders/${W.riders[0].id}/cash-balance`);expect(balance.body.data).toMatchObject({expectedPaise:12345,receivedPaise:2345,outstandingPaise:10000});expect((await prisma.cashCollection.findUniqueOrThrow({where:{id:row.id}})).remittedAt).toBeNull();
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/evidence`,{...input,amountPaise:1})).status).toBe(409);
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/evidence`,{...input,amountPaise:10001,idempotencyKey:randomUUID()})).body.code).toBe('CASH_AMOUNT_EXCEEDED');
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/evidence`,{...input,amountPaise:1.1,idempotencyKey:randomUUID()})).status).toBe(400);
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/evidence`,{...input,kind:'SHORTAGE_OBSERVED',amountPaise:1000,idempotencyKey:randomUUID()})).status).toBe(200);
  expect((await raw(W.riders[0],'get','/api/v1/drivers/cash-balance')).body.data.outstandingPaise).toBe(10000);
 });
 test('legacy full handover after partial receipts only records the remainder; full refund stays separately traced',async()=>{
  const row=await cash();expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/evidence`,{kind:'PLATFORM_RECEIPT',amountPaise:2345,reference:'partial-receipt-01',reason:'First envelope received',idempotencyKey:randomUUID()})).status).toBe(200);
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/remit`,{reference:'remainder-receipt-01'})).status).toBe(200);
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/remit`,{reference:'remainder-receipt-01'})).status).toBe(200);
  const events=await prisma.cashLedgerEvent.findMany({where:{collectionId:row.id,kind:'PLATFORM_RECEIPT'}});expect(events.map(e=>e.amountPaise).sort((a,b)=>a-b)).toEqual([2345,10000]);
  expect((await raw(W.admin,'get',`/api/v1/admin/cash/${row.id}/ledger`)).body.data).toMatchObject({receivedPaise:12345,outstandingPaise:0});
  expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/refund`,{reference:'customer-refund-01'})).status).toBe(200);expect((await raw(W.admin,'get',`/api/v1/admin/cash/${row.id}/ledger`)).body.data.refundedPaise).toBe(12345);
 });
 test('cash evidence is append-only at the database boundary',async()=>{
  const row=await cash();expect((await raw(W.admin,'post',`/api/v1/admin/cash/${row.id}/evidence`,{kind:'DISPUTE',amountPaise:345,reference:'dispute-sheet-01',reason:'Customer disputes exact change',idempotencyKey:randomUUID()})).status).toBe(200);
  const event=await prisma.cashLedgerEvent.findFirstOrThrow({where:{collectionId:row.id}});await expect(prisma.cashLedgerEvent.update({where:{id:event.id},data:{amountPaise:0}})).rejects.toThrow();await expect(prisma.cashLedgerEvent.delete({where:{id:event.id}})).rejects.toThrow();
 });
 test('daily closing preserves debt, calculates variance and needs an independent active supervisor',async()=>{
  await cash();const input={businessDate:cashBusinessDate(),countedPaise:12000,evidenceReference:'count-sheet-001',reason:'Physical cash counted after route'};
  const close=await raw(W.admin,'post',`/api/v1/admin/riders/${W.riders[0].id}/cash-close`,input);expect(close.status).toBe(201);expect(close.body.data).toMatchObject({expectedPaise:12345,receivedPaise:0,outstandingPaise:12345,countedPaise:12000,shortagePaise:345,overagePaise:0,state:'REVIEW_REQUIRED'});
  expect((await raw(W.admin,'post',`/api/v1/admin/cash-closes/${close.body.data.id}/review`,{approved:true,reason:'Checking my own money count'})).status).toBe(403);
  expect((await raw(other,'post',`/api/v1/admin/cash-closes/${close.body.data.id}/review`,{approved:true,reason:'Independently counted envelope'})).body.data.state).toBe('VARIANCE_CONFIRMED');
  expect((await raw(W.admin,'get',`/api/v1/admin/riders/${W.riders[0].id}/cash-balance`)).body.data.outstandingPaise).toBe(12345);
  expect((await raw(W.admin,'post',`/api/v1/admin/riders/${W.riders[0].id}/cash-close`,{...input,countedPaise:12345})).status).toBe(409);
 });
 test('command center shows genuine exceptions and only one concurrent operator can update a version',async()=>{
  const id=await support();await prisma.supportCase.update({where:{id},data:{dueAt:new Date(Date.now()-1000)}});
  expect((await raw(W.customers[0],'get','/api/v1/admin/operations/exceptions')).status).toBe(403);
  const q=await raw(W.admin,'get','/api/v1/admin/operations/exceptions');expect(q.status).toBe(200);expect(q.body.data.data.some((e:any)=>e.key==='SUPPORT_OVERDUE'&&e.referenceId===id)).toBe(true);
  const input={exceptionKey:'SUPPORT_OVERDUE',referenceType:'SUPPORT_CASE',referenceId:id,version:0,state:'ESCALATED',reason:'Escalated to the support supervisor',ownerId:W.admin.id};
  const concurrent=await Promise.all([raw(W.admin,'post','/api/v1/admin/operations/resolutions',input),raw(other,'post','/api/v1/admin/operations/resolutions',input)]);expect(concurrent.map(r=>r.status).sort()).toEqual([200,409]);
  expect(await prisma.adminAuditLog.count({where:{targetId:id,action:'OPERATION_RESOLUTION_RECORDED'}})).toBe(1);
  expect((await raw(W.admin,'post','/api/v1/admin/operations/resolutions',{...input,version:1,state:'RESOLVED',evidenceReference:'resolution-case-01'})).body.code).toBe('EXCEPTION_STILL_ACTIVE');
 });
 test('unknown payment creation appears as operator review without exposing provider secrets or issuing gateway retries',async()=>{
  const row=await prisma.order.create({data:{customerId:W.customers[0].id,vendorId:W.vendors[0].vendorId,totalAmount:123.45,dropoffHostel:'Saved address'}});await prisma.paymentCreation.create({data:{orderId:row.id,amountPaise:12345,state:'UNKNOWN',claimToken:'internal-only-secret-claim'}});
  const r=await raw(W.admin,'get','/api/v1/admin/operations/exceptions');expect(r.status).toBe(200);const item=r.body.data.data.find((e:any)=>e.key==='PAYMENT_CREATE_UNKNOWN'&&e.orderId===row.id);expect(item.actions).toContain('OPERATOR_REVIEW');expect(JSON.stringify(r.body)).not.toContain('internal-only-secret-claim');
  await prisma.paymentCreation.delete({where:{orderId:row.id}});
 });
});
