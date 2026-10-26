import { Prisma, CashCollection } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { activeSupportAdmin } from './supportCases';

const bad=(message:string,field?:string)=>new AppError(400,'BAD_CASH_RECONCILIATION',message,field);
export const cashBusinessDate=(at=new Date())=>new Date(at.getTime()+330*60000).toISOString().slice(0,10);
export function cashDateRange(input:unknown) {
  if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input))throw bad('Choose a valid Indian business date.','businessDate');
  const date=new Date(input+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input||input>cashBusinessDate())throw bad('Choose a real date that is not in the future.','businessDate');
  const start=new Date(date.getTime()-330*60000);return {businessDate:input,start,end:new Date(start.getTime()+86400000)};
}
export function cashPaise(value:unknown,field='amountPaise') {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>100000000)throw bad('Enter an exact non-negative amount in paise, within the cash recording limit.',field);
  return value;
}
export function cashReference(value:unknown,field='reference') {
  if(typeof value!=='string'||value.trim().length<5||value.length>120||/[\x00-\x1f\x7f]/.test(value))throw bad('Enter a traceable reference of 5–120 characters.',field);
  return value.trim();
}
function reason(value:unknown) {
  if(typeof value!=='string'||value.trim().length<5||value.length>500||/[\x00-\x1f\x7f]/.test(value))throw bad('Explain the physical evidence and reason in 5–500 characters.','reason');
  return value.trim();
}
const sum=(values:number[])=>{const total=values.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(total))throw new AppError(503,'REPORT_TOO_LARGE','Narrow the cash report range.');return total;};
export async function appendLegacyCashEvent(tx:Prisma.TransactionClient,cash:CashCollection,action:'remit'|'refund',actorId:string,reference:string) {
  // Called under the existing collection lock in the same financial transaction, including idempotent retries.
  const idempotencyKey=`legacy-cash:${cash.id}:${action}`;
  const before=await tx.cashLedgerEvent.findUnique({where:{idempotencyKey}});
  if(before){if(before.reference!==reference)throw new AppError(409,'CASH_EVENT_CONFLICT','This cash event was already recorded differently.');return before;}
  const ledger=await cashCollectionLedger(tx,cash);
  const amountPaise=action==='remit'?ledger.outstandingPaise:cash.amountPaise-ledger.refundedPaise;
  if(amountPaise<=0)return null;
  return tx.cashLedgerEvent.create({data:{collectionId:cash.id,driverUserId:cash.driverUserId,kind:action==='remit'?'PLATFORM_RECEIPT':'PLATFORM_REFUND',amountPaise,reference,reason:action==='remit'?'Operator verified full physical cash handover.':'Operator verified completed customer cash refund after platform receipt.',actorId,businessDate:cashBusinessDate(),idempotencyKey}});
}
export async function cashCollectionLedger(tx:Prisma.TransactionClient,cash:CashCollection) {
  const events=await tx.cashLedgerEvent.findMany({where:{collectionId:cash.id},orderBy:[{createdAt:'asc'},{id:'asc'}]});
  const receipts=events.filter(e=>e.kind==='PLATFORM_RECEIPT');
  // Historical administrative receipts predate the additive event table. Never count both sources.
  const receivedPaise=receipts.length?sum(receipts.map(e=>e.amountPaise)):cash.remittedAt?cash.amountPaise:0;
  const refundedPaise=events.some(e=>e.kind==='PLATFORM_REFUND')?sum(events.filter(e=>e.kind==='PLATFORM_REFUND').map(e=>e.amountPaise)):cash.refundedAt?cash.amountPaise:0;
  const outstandingPaise=Math.max(0,cash.amountPaise-receivedPaise);
  return {expectedPaise:cash.amountPaise,receivedPaise,refundedPaise,outstandingPaise,hasDispute:events.some(e=>e.kind==='DISPUTE'),events};
}
export async function recordCashEvidence(id:string,actorId:string,input:any) {
  const kind=input?.kind;
  if(!['PLATFORM_RECEIPT','DISPUTE','HANDOVER_FAILED','SHORTAGE_OBSERVED','OVERAGE_OBSERVED'].includes(kind))throw bad('Choose a supported cash evidence event.','kind');
  const amountPaise=cashPaise(input.amountPaise),reference=cashReference(input.reference),why=reason(input.reason),key=cashReference(input.idempotencyKey,'idempotencyKey');
  if(kind==='PLATFORM_RECEIPT'&&amountPaise===0)throw bad('A physical cash receipt must have a positive amount.','amountPaise');
  return prisma.$transaction(async tx=>{
    await activeSupportAdmin(tx,actorId);
    const lock=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "CashCollection" WHERE "id"=${id} FOR UPDATE`;
    if(!lock.length)throw new AppError(404,'NOT_FOUND','Cash collection not found.');
    const cash=await tx.cashCollection.findUniqueOrThrow({where:{id}});
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cash-driver:${cash.driverUserId}`}))::text`;
    const previous=await tx.cashLedgerEvent.findUnique({where:{idempotencyKey:key}});
    if(previous){if(previous.collectionId!==id||previous.kind!==kind||previous.amountPaise!==amountPaise||previous.reference!==reference||previous.reason!==why)throw new AppError(409,'IDEMPOTENCY_CONFLICT','This request key already identifies different cash evidence.');return {event:previous,ledger:await cashCollectionLedger(tx,cash),idempotent:true};}
    const before=await cashCollectionLedger(tx,cash);
    if(kind==='PLATFORM_RECEIPT'&&amountPaise>before.outstandingPaise)throw new AppError(409,'CASH_AMOUNT_EXCEEDED','Cash receipt exceeds the amount still owed for this collection.');
    const event=await tx.cashLedgerEvent.create({data:{collectionId:id,driverUserId:cash.driverUserId,kind,amountPaise,reference,reason:why,actorId,businessDate:cashBusinessDate(),idempotencyKey:key}});
    if(kind==='PLATFORM_RECEIPT'&&amountPaise===before.outstandingPaise)await tx.cashCollection.update({where:{id},data:{remittedAt:new Date(),remittedById:actorId,remittanceReference:reference}});
    await tx.adminAuditLog.create({data:{action:'CASH_EVIDENCE_RECORDED',targetType:'CASH_COLLECTION',targetId:id,summary:`Admin ${actorId} recorded ${kind} ${amountPaise} paise; receipt ${reference}. Variance observations do not mark money received or forgive debt.`}});
    return {event,ledger:await cashCollectionLedger(tx,await tx.cashCollection.findUniqueOrThrow({where:{id}})),idempotent:false};
  });
}
export async function riderCashBalance(driverUserId:string,until?:Date) {
  return prisma.$transaction(async tx=>{
    const rows=await tx.cashCollection.findMany({where:{driverUserId,...(until?{collectedAt:{lt:until}}:{})},orderBy:{id:'asc'},take:10001});
    if(rows.length>10000)throw new AppError(503,'REPORT_TOO_LARGE','Narrow the cash balance range.');
    const ledgers=[];for(const cash of rows)ledgers.push({id:cash.id,orderId:cash.orderId,collectedAt:cash.collectedAt,...await cashCollectionLedger(tx,cash)});
    return {driverUserId,expectedPaise:sum(ledgers.map(l=>l.expectedPaise)),receivedPaise:sum(ledgers.map(l=>l.receivedPaise)),refundedPaise:sum(ledgers.map(l=>l.refundedPaise)),outstandingPaise:sum(ledgers.map(l=>l.outstandingPaise)),disputedCollections:ledgers.filter(l=>l.hasDispute).length,collections:ledgers};
  });
}
export async function createCashDailyClose(driverUserId:string,actorId:string,input:any) {
  const range=cashDateRange(input?.businessDate),countedPaise=cashPaise(input?.countedPaise,'countedPaise'),why=reason(input?.reason),evidenceReference=cashReference(input?.evidenceReference,'evidenceReference');
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cash-driver:${driverUserId}`}))::text`;
    await activeSupportAdmin(tx,actorId);
    const rider=await tx.driverPartner.findUnique({where:{userId:driverUserId}});if(!rider)throw new AppError(404,'NOT_FOUND','Rider not found.');
    const previous=await tx.cashDailyClose.findUnique({where:{driverUserId_businessDate:{driverUserId,businessDate:range.businessDate}}});
    if(previous){if(previous.countedPaise!==countedPaise||previous.reason!==why||previous.evidenceReference!==evidenceReference)throw new AppError(409,'CASH_CLOSE_EXISTS','This daily cash snapshot is already recorded. Record a dispute or correction event; do not overwrite financial history.');return previous;}
    const rows=await tx.cashCollection.findMany({where:{driverUserId,collectedAt:{gte:range.start,lt:range.end}},orderBy:{id:'asc'},take:10001});
    if(rows.length>10000)throw new AppError(503,'REPORT_TOO_LARGE','Too many cash collections for one closing.');
    const ledgers=[];for(const cash of rows)ledgers.push(await cashCollectionLedger(tx,cash));
    const expectedPaise=sum(ledgers.map(l=>l.expectedPaise)),receivedPaise=sum(ledgers.map(l=>l.receivedPaise)),outstandingPaise=sum(ledgers.map(l=>l.outstandingPaise));
    const row=await tx.cashDailyClose.create({data:{driverUserId,businessDate:range.businessDate,expectedPaise,receivedPaise,outstandingPaise,countedPaise,evidenceReference,shortagePaise:Math.max(0,outstandingPaise-countedPaise),overagePaise:Math.max(0,countedPaise-outstandingPaise),reason:why,actorId,state:'REVIEW_REQUIRED'}});
    await tx.adminAuditLog.create({data:{action:'CASH_DAILY_CLOSE_CREATED',targetType:'CASH_DAILY_CLOSE',targetId:row.id,summary:`Admin ${actorId} recorded an immutable ${range.businessDate} collection-cohort snapshot; independent supervisor review required. Counted cash is still with the rider, not a platform receipt.`}});
    return row;
  });
}
export async function reviewCashDailyClose(id:string,actorId:string,input:any) {
  if(typeof input?.approved!=='boolean')throw bad('Choose approval or rejection explicitly.','approved');
  const why=reason(input?.reason);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "CashDailyClose" WHERE "id"=${id} FOR UPDATE`;
    const close=await tx.cashDailyClose.findUnique({where:{id}});if(!close)throw new AppError(404,'NOT_FOUND','Cash closing not found.');
    if(close.actorId===actorId)throw new AppError(403,'INDEPENDENT_REVIEW_REQUIRED','A different active administrator must review this cash closing.');
    await activeSupportAdmin(tx,actorId);
    const state=input.approved?(close.shortagePaise||close.overagePaise?'VARIANCE_CONFIRMED':'RECONCILED'):'DISPUTED';
    if(close.reviewedAt){if(close.reviewedById===actorId&&close.state===state)return close;throw new AppError(409,'CASH_CLOSE_REVIEWED','This cash closing has already been reviewed. Append a dispute rather than replacing the decision.');}
    const result=await tx.cashDailyClose.update({where:{id},data:{state,reviewedById:actorId,reviewedAt:new Date()}});
    await tx.cashLedgerEvent.create({data:{driverUserId:close.driverUserId,kind:input.approved?'DAILY_CLOSE_REVIEWED':'DAILY_CLOSE_DISPUTED',amountPaise:close.outstandingPaise,reference:close.evidenceReference,reason:why,actorId,supervisorId:actorId,businessDate:close.businessDate,idempotencyKey:`cash-close-review:${id}`}});
    await tx.adminAuditLog.create({data:{action:'CASH_DAILY_CLOSE_REVIEWED',targetType:'CASH_DAILY_CLOSE',targetId:id,summary:`Independent admin ${actorId} marked ${state}; original physical count and rider debt remain unchanged. Reason: ${why}`}});
    return result;
  });
}
