import {Prisma} from '@prisma/client';
import {prisma} from '../db';
import {AppError} from '../utils/appError';

const DAY=86_400_000,IST=330*60_000;
/** Inclusive IST calendar days through the request instant, never future orders. */
export function overviewRange(raw:unknown,now=new Date()) {
  const days=raw===undefined?7:Number(raw);
  if(!['1','7','30','90'].includes(String(raw??7)))throw new AppError(400,'BAD_RANGE','Choose Today, 7, 30 or 90 days.','days');
  const midnight=Math.floor((now.getTime()+IST)/DAY)*DAY-IST;
  return {days,from:new Date(midnight-(days-1)*DAY),to:now};
}
const integer=(raw:unknown)=>{const n=Number(raw??0);if(!Number.isSafeInteger(n)||n<0)throw new AppError(503,'REPORT_TOO_LARGE','Narrow the report range.');return n;};
export async function marketplaceOverview(cityId:string|undefined,rawDays:unknown) {
  const range=overviewRange(rawDays),{from,to,days}=range;
  const city=cityId?Prisma.sql`AND v."cityId"=${cityId}`:Prisma.empty;
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
    // Aggregate each money source before joining. This prevents multiple payment attempts or
    // cash events multiplying order counts or amounts. Money follows the order-created cohort.
    const rows=await tx.$queryRaw<Array<{bucket:string;status:string;method:string;vendorId:string;vendorName:string;orders:bigint;captured:bigint;received:bigint;pending:bigint}>>(Prisma.sql`
      WITH cohort AS (
        SELECT o.id,o.status,o."paymentMethod",o."vendorId",v.name,
          to_char(o."createdAt" + interval '330 minutes','YYYY-MM-DD') AS bucket
        FROM "Order" o JOIN "Vendor" v ON v.id=o."vendorId"
        WHERE o."createdAt">=${from} AND o."createdAt"<=${to} ${city}
      ), online AS (
        SELECT p."orderId",SUM(p."capturedAmountPaise") AS captured
        FROM "Payment" p JOIN cohort o ON o.id=p."orderId"
        WHERE p."capturedAmountPaise">0 AND o."paymentMethod"='ONLINE' GROUP BY p."orderId"
      ), cash AS (
        SELECT c."orderId",c."amountPaise",COALESCE(SUM(e."amountPaise") FILTER(WHERE e.kind='PLATFORM_RECEIPT'),CASE WHEN c."remittedAt" IS NOT NULL THEN c."amountPaise" ELSE 0 END) AS received
        FROM "CashCollection" c JOIN cohort o ON o.id=c."orderId"
        LEFT JOIN "CashLedgerEvent" e ON e."collectionId"=c.id
        GROUP BY c.id
      )
      SELECT o.bucket,o.status::text,o."paymentMethod" AS method,o."vendorId",o.name AS "vendorName",
        COUNT(*) AS orders,COALESCE(SUM(p.captured),0)::bigint AS captured,
        COALESCE(SUM(c.received),0)::bigint AS received,
        COALESCE(SUM(GREATEST(c."amountPaise"-c.received,0)),0)::bigint AS pending
      FROM cohort o LEFT JOIN online p ON p."orderId"=o.id LEFT JOIN cash c ON c."orderId"=o.id
      GROUP BY o.bucket,o.status,o."paymentMethod",o."vendorId",o.name
    `);
    const trend=Array.from({length:days},(_,i)=>({date:new Date(from.getTime()+i*DAY+IST).toISOString().slice(0,10),orders:0,capturedPaise:0,receivedCashPaise:0}));
    const statuses=new Map<string,number>(),payments=new Map<string,number>(),vendors=new Map<string,{id:string;name:string;orders:number}>();
    let orders=0,capturedPaise=0,receivedCashPaise=0,pendingCashPaise=0;
    for(const row of rows){
      const count=integer(row.orders),captured=integer(row.captured),received=integer(row.received);
      orders+=count;capturedPaise+=captured;receivedCashPaise+=received;pendingCashPaise+=integer(row.pending);
      statuses.set(row.status,(statuses.get(row.status)??0)+count);payments.set(row.method,(payments.get(row.method)??0)+count);
      const vendor=vendors.get(row.vendorId)??{id:row.vendorId,name:row.vendorName,orders:0};vendor.orders+=count;vendors.set(row.vendorId,vendor);
      const point=trend.find(p=>p.date===row.bucket);if(point){point.orders+=count;point.capturedPaise+=captured;point.receivedCashPaise+=received;}
    }
    for(const n of [orders,capturedPaise,receivedCashPaise,pendingCashPaise])integer(n);
    const vendorScope=cityId?{cityId}:{},riderScope=cityId?{cityId}:{};
    const [approvedStores,openStores,pendingStores,pendingRiders,riderGroups,urgentOrders]=await Promise.all([
      tx.vendor.count({where:{...vendorScope,approvalStatus:'APPROVED'}}),
      tx.vendor.count({where:{...vendorScope,approvalStatus:'APPROVED',isAcceptingOrders:true}}),
      tx.vendor.count({where:{...vendorScope,approvalStatus:'PENDING'}}),
      tx.driverPartner.count({where:{...riderScope,approvalStatus:'PENDING'}}),
      tx.driverPartner.groupBy({by:['dutyStatus'],where:{...riderScope,approvalStatus:'APPROVED'},_count:{_all:true}}),
      tx.order.count({where:{createdAt:{gte:from,lte:to},...(cityId?{vendor:{cityId}}:{}),OR:[{otpLocked:true},{refundStatus:'FAILED'}]}})
    ]);
    return {from:from.toISOString(),to:to.toISOString(),days,cityId:cityId??null,refreshedAt:to.toISOString(),
      orders,delivered:statuses.get('DELIVERED')??0,active:orders-(statuses.get('DELIVERED')??0)-(statuses.get('CANCELLED')??0),capturedPaise,receivedCashPaise,pendingCashPaise,
      approvedStores,openStores,pendingApprovals:pendingStores+pendingRiders,urgentOrders,
      riders:riderGroups.map(r=>({name:r.dutyStatus,count:r._count._all})),
      statuses:[...statuses].map(([name,count])=>({name,count})),payments:[...payments].map(([name,count])=>({name,count})),
      topVendors:[...vendors.values()].sort((a,b)=>b.orders-a.orders||a.id.localeCompare(b.id)).slice(0,8),trend,
      definitions:{orders:'Store orders created within the selected IST calendar dates. A multi-store checkout counts once per store.',
        money:'Verified online captured amounts and recorded platform cash receipts, before refunds, for the order-created cohort. Includes later receipts on those orders; not net revenue, settled vendor payouts or uncollected COD.',
        pendingCash:'Cash collected by riders on these orders minus recorded platform receipts. Not received platform funds.',
        network:'Store approvals and rider duty are current snapshots for the selected city, independent of the order date range.'}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000});
}
