import { randomUUID } from 'crypto';
import { prisma,cleanTestOrders,seedTestDatabase } from '../harness/db';
import { compliancePatch,complianceIssues,saveSellerCompliance,reviewSellerCompliance } from '../../src/services/sellerCompliance';
import { orderReceipt,receiptHtml } from '../../src/services/orderReceipt';
import { inspectSettlement,planSettlementPayout } from '../../src/services/payoutReadiness';
import { SandboxDisbursementAdapter,liveDisbursementAdapter } from '../../src/services/disbursementAdapter';
import { markPaid,createSettlements } from '../../src/services/settlement';
import { invalidateSettingsCache } from '../../src/services/settings';

jest.setTimeout(90000);
const owner={id:'usr-3',role:'VENDOR'},admin={id:'usr-5',role:'ADMIN'},customer={id:'usr-1',role:'STUDENT'};
const valid={businessName:'Grozo Synthetic Grocery',businessAddress:'Demonstration address, India',contactEmail:'grocer@example.test',contactPhone:'+919999999999',gstApplicable:false,gstNumber:null,fssaiApplicable:true,fssaiNumber:'12345678901234',fssaiExpiresAt:'2099-12-31',authorizedSellerName:'Synthetic Store Operator',documentReferences:[{kind:'FSSAI',reference:'private-registry/demo-fssai',expiresAt:'2099-12-31'}]};
const newOrder=async(data:any={})=>prisma.order.create({data:{customerId:'usr-1',vendorId:'ven-1',status:'DELIVERED',paymentStatus:'PAID',paymentMethod:'ONLINE',deliveredAt:new Date(Date.now()-10*86400000),subtotal:100,totalAmount:120,vendorSubtotal:80,commissionTotal:20,deliveryFee:20,dropoffHostel:'Historic compatibility address',...data,items:{create:{name:'Milk <script>alert(1)</script>',quantity:1,price:100,vendorUnitPrice:80,commissionUnit:20}}}});
const newSettlement=async(orderId:string)=>{const s=await prisma.settlement.create({data:{vendorId:'ven-1',batchKey:randomUUID(),periodStart:new Date(Date.now()-10*86400000),periodEnd:new Date(),status:'PENDING',orderCount:1,foodGross:100,vendorAmount:80,commissionAmount:20,netPayable:80,createdBy:admin.id}});await prisma.order.update({where:{id:orderId},data:{settlementId:s.id}});return s;};
beforeEach(async()=>{await cleanTestOrders();await prisma.settlement.deleteMany();await prisma.sellerCompliance.deleteMany();await seedTestDatabase();await prisma.appSetting.deleteMany();invalidateSettingsCache();});
afterAll(async()=>{await cleanTestOrders();await prisma.settlement.deleteMany();await prisma.sellerCompliance.deleteMany();await prisma.$disconnect();});

describe('Seller compliance is operator-reviewed, scoped and never fabricated tax approval',()=>{
 test('required document and applicability checks prevent incomplete verification',async()=>{
  const p=await saveSellerCompliance('ven-1',{revision:0,businessName:'Synthetic grocer'},owner);
  expect(p.status).toBe('DRAFT');expect(complianceIssues(p)).toContain('APPLICABILITY_REVIEW_REQUIRED');
  await expect(reviewSellerCompliance('ven-1',{revision:1,decision:'VERIFIED',reason:'Checked private originals'},admin.id)).rejects.toMatchObject({code:'COMPLIANCE_INCOMPLETE'});
 });
 test('valid review is audited, edits clear approval, stale reviewer cannot re-approve',async()=>{
  const p=await saveSellerCompliance('ven-1',{revision:0,...valid,requiredDocuments:['FSSAI']},admin);
  const approved=await reviewSellerCompliance('ven-1',{revision:p.revision,decision:'VERIFIED',reason:'Operator inspected demo originals'},admin.id);
  expect(approved.status).toBe('VERIFIED');
  const edited=await saveSellerCompliance('ven-1',{revision:approved.revision,businessName:'Changed synthetic grocer'},owner);
  expect(edited.status).toBe('DRAFT');expect(edited.reviewedAt).toBeNull();
  await expect(reviewSellerCompliance('ven-1',{revision:approved.revision,decision:'VERIFIED',reason:'A stale tab must not approve'},admin.id)).rejects.toMatchObject({code:'COMPLIANCE_CHANGED'});
  expect(await prisma.adminAuditLog.count({where:{action:'SELLER_COMPLIANCE_REVIEWED',targetId:'ven-1'}})).toBeGreaterThan(0);
 });
 test('owner cannot self-set requirements/status, claim another store or save public document links',async()=>{
  expect(()=>compliancePatch({status:'VERIFIED'},false)).toThrow();expect(()=>compliancePatch({requiredDocuments:[]},false)).toThrow();
  expect(()=>compliancePatch({documentReferences:[{kind:'FSSAI',reference:'https://public.example.test/passport'}]},false)).toThrow();
  await expect(saveSellerCompliance('ven-1',{revision:0,...valid},{id:'usr-1',role:'VENDOR'})).rejects.toMatchObject({status:404});
 });
 test('invalid GST format and expired FSSAI never pass verification',()=>{
  expect(()=>compliancePatch({gstNumber:'NOT-A-GSTIN'},false)).toThrow();
  expect(complianceIssues({...valid,fssaiExpiresAt:new Date(0)})).toContain('FSSAI_EXPIRED');
 });
});

describe('Owned receipts and payout reconciliation',()=>{
 test('receipt reflects server amounts, escapes product names and withholds unverified tax identifiers',async()=>{
  await saveSellerCompliance('ven-1',{revision:0,...valid},owner);const order=await newOrder();const receipt=await orderReceipt(order.id,customer);
  expect(receipt.kind).toBe('ORDER_RECEIPT');expect(receipt.amounts).toEqual({subtotalPaise:10000,deliveryFeePaise:2000,taxAndPackagingPaise:0,discountPaise:0,totalPaise:12000});
  expect(receipt.seller.fssaiNumber).toBeNull();expect(receipt.taxDisclosure).toContain('not a GST tax invoice');
  const html=receiptHtml(receipt);expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
  await expect(orderReceipt(order.id,{id:'another-customer',role:'STUDENT'})).rejects.toMatchObject({status:404});
  await expect(orderReceipt(order.id,{id:'usr-4',role:'DRIVER'})).rejects.toMatchObject({status:404});
 });
 test('repeated dry runs do not change settlement or pretend a bank transfer',async()=>{
  const order=await newOrder(),s=await newSettlement(order.id),key=randomUUID();
  const [a,b]=await Promise.all([planSettlementPayout(s.id,key,admin.id),planSettlementPayout(s.id,key,admin.id)]);
  expect([a.replay,b.replay].sort()).toEqual([false,true]);expect(a.state).toBe('DRY_RUN');expect(a.bankTransferProven).toBe(false);expect(a.liveExecutionEnabled).toBe(false);
  expect((await prisma.settlement.findUniqueOrThrow({where:{id:s.id}})).status).toBe('PENDING');
  expect(await prisma.adminAuditLog.count({where:{action:'PAYOUT_DRY_RUN_PLANNED',targetId:`${s.id}:${key}`}})).toBe(1);
 });
 test('pending refund blocks payment recording and settlement creation',async()=>{
  const order=await newOrder();const p=await prisma.payment.create({data:{orderId:order.id,razorpayOrderId:randomUUID(),amount:120,status:'PAID'}});
  await prisma.paymentRefund.create({data:{orderId:order.id,paymentId:p.id,amountPaise:1000,reason:'Customer-approved shortage',idempotencyKey:randomUUID(),state:'SUBMITTED'}});
  const run=await createSettlements({vendorId:'ven-1',createdBy:admin.id});expect(run.orderCount).toBe(0);
  const s=await newSettlement(order.id);expect((await inspectSettlement(prisma,s.id)).reasons).toContain('REFUND_REVIEW_REQUIRED');
  await expect(markPaid(s.id,{reference:'TEST-UNSAFE-REFUND'},admin)).rejects.toMatchObject({code:'PAYOUT_REVIEW_REQUIRED'});
 });
 test('unremitted COD blocks settlement until independently recorded platform receipt',async()=>{
  const order=await newOrder({paymentMethod:'COD',workflowVersion:2});const s=await newSettlement(order.id);
  const check=await inspectSettlement(prisma,s.id);expect(check.codOutstandingPaise).toBe(12000);expect(check.reasons).toContain('COD_NOT_REMITTED');
  await prisma.cashCollection.create({data:{orderId:order.id,driverUserId:'usr-4',amountPaise:12000}});
  await expect(markPaid(s.id,{reference:'TEST-UNREMITTED'},admin)).rejects.toMatchObject({code:'PAYOUT_REVIEW_REQUIRED'});
  await prisma.cashCollection.update({where:{orderId:order.id},data:{remittedAt:new Date(),remittedById:admin.id,remittanceReference:'TEST-PLATFORM-RECEIPT'}});
  expect((await inspectSettlement(prisma,s.id)).reasons).not.toContain('COD_NOT_REMITTED');
 });
 test('changed earnings cannot be recorded as paid without reconciling settlement totals',async()=>{
  const order=await newOrder(),s=await newSettlement(order.id);await prisma.order.update({where:{id:order.id},data:{vendorSubtotal:70}});
  await expect(markPaid(s.id,{reference:'TEST-STALE-LEDGER'},admin)).rejects.toMatchObject({code:'PAYOUT_REVIEW_REQUIRED'});
 });
});

describe('Explicit sandbox adapter contract; no real banking integration claimed',()=>{
 test('retries return one sandbox result and conflicting details are rejected',async()=>{
  const a=new SandboxDisbursementAdapter(),input={settlementId:'test-settlement',amountPaise:8000,currency:'INR' as const,idempotencyKey:'sandbox-key-123',beneficiaryReference:'verified-private-reference'};
  const [x,y]=await Promise.all([a.create(input),a.create(input)]);expect(x).toEqual(y);expect(x.state).toBe('SANDBOX_CONFIRMED');expect(x.bankTransferProven).toBe(false);
  await expect(a.create({...input,amountPaise:9000})).rejects.toMatchObject({code:'PAYOUT_KEY_CONFLICT'});
  expect(await a.lookup(input.idempotencyKey)).toEqual(x);
 });
 test('an environment flag alone cannot enable live transfer',()=>{expect(()=>liveDisbursementAdapter()).toThrow('not configured or authorized');});
});
