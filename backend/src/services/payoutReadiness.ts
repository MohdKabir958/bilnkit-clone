import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { toPaise } from './pricing';

type Db=Prisma.TransactionClient;
export const FINANCIAL_SUPPORT_CATEGORIES=['MISSING_ITEM','WRONG_ITEM','DAMAGED_ITEM','EXPIRED_ITEM','PAYMENT_CHARGED','REFUND_NOT_RECEIVED','DELIVERY_FAILED'];
/** Pure database preflight. It never contacts a bank, decrypts a destination or changes a financial amount. */
export const inspectSettlement=async(db:Db,id:string)=>{
 const s=await db.settlement.findUnique({where:{id},include:{vendor:{include:{user:{select:{id:true,deletedAt:true,payoutAccount:{select:{verifiedAt:true,method:true,accountLast4:true}}}}}},orders:{include:{cashCollection:true,refundRequests:true,adjustments:true,supportCases:{select:{category:true,status:true}}}}}});
 if(!s)throw new AppError(404,'NOT_FOUND','Settlement not found.');
 const reasons:string[]=[];
 if(s.status!=='PENDING')reasons.push(`SETTLEMENT_${s.status}`);
 if(toPaise(s.netPayable)<=0)reasons.push('NOTHING_TO_PAY');
 if(s.vendor.approvalStatus!=='APPROVED'||!s.vendor.userId||s.vendor.user?.deletedAt)reasons.push('SELLER_ACCOUNT_UNAVAILABLE');
 if(!s.vendor.user?.payoutAccount?.verifiedAt)reasons.push('PAYOUT_ACCOUNT_NOT_VERIFIED');
 const expectedVendorPaise=s.orders.reduce((n,o)=>n+toPaise(o.vendorSubtotal),0);
 if(expectedVendorPaise!==toPaise(s.vendorAmount)||s.orderCount!==s.orders.length||toPaise(s.vendorAmount)+toPaise(s.adjustmentTotal)!==toPaise(s.netPayable))reasons.push('LEDGER_RECONCILIATION_REQUIRED');
 const pendingRefunds=s.orders.filter(o=>o.refundRequests.some(r=>r.state!=='PROCESSED'&&r.state!=='VOID')||o.refundStatus&&o.refundStatus!=='NONE');
 if(pendingRefunds.length)reasons.push('REFUND_REVIEW_REQUIRED');
 if(s.orders.some(o=>o.adjustments.some(a=>a.state==='PROPOSED')))reasons.push('ITEM_ADJUSTMENT_PENDING');
 const codOutstandingPaise=s.orders.reduce((n,o)=>n+(o.paymentMethod==='COD'&&!o.cashCollection?.remittedAt?(o.cashCollection?.amountPaise??toPaise(o.totalAmount)):0),0);
 if(codOutstandingPaise>0)reasons.push('COD_NOT_REMITTED');
 if(s.orders.some(o=>o.status!=='DELIVERED'||o.paymentStatus!=='PAID'))reasons.push('ORDER_NO_LONGER_ELIGIBLE');
 if(s.orders.some(o=>o.supportCases.some(c=>c.status!=='RESOLVED'&&FINANCIAL_SUPPORT_CATEGORIES.includes(c.category))))reasons.push('FINANCIAL_SUPPORT_CASE_OPEN');
 return {settlementId:id,eligible:reasons.length===0,reasons,amountPaise:toPaise(s.netPayable),expectedVendorPaise,adjustmentPaise:toPaise(s.adjustmentTotal),codOutstandingPaise,orderCount:s.orders.length,checkedAt:new Date(),liveExecutionEnabled:false,provider:'manual',bankTransferProven:false};
};
export const settlementReadiness=(id:string)=>inspectSettlement(prisma,id);
/** Financial changes invalidate eligibility even for existing/manual settlement records. Missing payout details are shown separately;
 * mark-paid records a past external transfer, so it must not invent bank-provider verification for historical/manual records. */
export const assertSettlementFinanciallySafe=async(db:Db,id:string)=>{
 const check=await inspectSettlement(db,id);
 const blocking=check.reasons.filter(r=>!['PAYOUT_ACCOUNT_NOT_VERIFIED','SELLER_ACCOUNT_UNAVAILABLE'].includes(r));
 if(blocking.length)throw new AppError(409,'PAYOUT_REVIEW_REQUIRED',`Resolve settlement checks before recording payment: ${blocking.join(', ')}.`);
 return check;
};
/** Stable dry-run idempotency under a short advisory lock. Audit evidence is a PLAN, explicitly not proof of a bank transfer. */
export const planSettlementPayout=async(id:string,requestKey:unknown,actorId:string)=>{
 if(typeof requestKey!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(requestKey))throw new AppError(400,'REQUEST_KEY_REQUIRED','Use an 8–64 character payout planning request key.');
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payout-plan:${id}:${requestKey}`},0))::text`;
  const check=await inspectSettlement(tx,id);
  const targetId=`${id}:${requestKey}`;
  const old=await tx.adminAuditLog.findFirst({where:{action:'PAYOUT_DRY_RUN_PLANNED',targetType:'SETTLEMENT',targetId}});
  if(!old)await tx.adminAuditLog.create({data:{action:'PAYOUT_DRY_RUN_PLANNED',targetType:'SETTLEMENT',targetId,summary:`Admin ${actorId} requested a dry run. Amount ${check.amountPaise} paise; eligible ${check.eligible}. No funds transferred.`}});
  return {...check,requestKey,replay:!!old,state:'DRY_RUN',message:'No funds were transferred. Live disbursement is unavailable until a verified provider adapter and operator approval are configured.'};
 });
};
