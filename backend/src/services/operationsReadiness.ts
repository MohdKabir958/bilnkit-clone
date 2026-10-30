import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { activeSupportAdmin, escalateOverdueSupportCases } from './supportCases';

export type OperationalException={key:string;referenceType:'ORDER'|'SUPPORT_CASE'|'CASH_COLLECTION';referenceId:string;orderId:string|null;severity:'URGENT'|'HIGH'|'NORMAL';title:string;createdAt:Date;slaAt:Date|null;ownerId:string|null;actions:string[];resolution?:unknown};
/** A bounded projection over existing ledgers. No recovery action is performed merely by reading this dashboard. */
export async function operationalExceptions(cityId?:string,now=new Date()) {
  const [orders,cases,cash,resolutions]=await Promise.all([
    prisma.order.findMany({where:{...(cityId?{vendor:{cityId}}:{}),OR:[{status:{notIn:['DELIVERED','CANCELLED']}},{refundStatus:{in:['PENDING','FAILED']}}]},orderBy:{createdAt:'asc'},take:301,include:{vendor:{select:{approvalStatus:true,userId:true}},driver:{select:{driverProfile:{select:{approvalStatus:true}}}},payments:{select:{status:true,createdAt:true}},inventoryReservations:{select:{unusableQty:true,pendingInspectionQty:true}},adjustments:{where:{state:'PROPOSED'},select:{expiresAt:true,createdAt:true}}}}),
    prisma.supportCase.findMany({where:{status:{not:'RESOLVED'},dueAt:{lte:now},...(cityId?{order:{vendor:{cityId}}}:{})},orderBy:{dueAt:'asc'},take:101,select:{id:true,orderId:true,createdAt:true,dueAt:true,assignedToId:true,priority:true}}),
    prisma.cashCollection.findMany({where:{...(cityId?{order:{vendor:{cityId}}}:{}),OR:[{remittedAt:null,collectedAt:{lt:new Date(now.getTime()-86400000)}},{events:{some:{kind:{in:['DISPUTE','HANDOVER_FAILED','SHORTAGE_OBSERVED','OVERAGE_OBSERVED']}}}}]},orderBy:{collectedAt:'asc'},take:101,include:{events:{where:{kind:{in:['DISPUTE','HANDOVER_FAILED','SHORTAGE_OBSERVED','OVERAGE_OBSERVED']}},select:{kind:true}},order:{select:{id:true}}}}),
    prisma.operationalResolution.findMany({where:{state:{not:'RESOLVED'}},orderBy:{updatedAt:'desc'},take:1000}),
  ]);
  const [creations,refunds]=await Promise.all([
    prisma.paymentCreation.findMany({where:{OR:[{state:'UNKNOWN'},{state:'CREATING',createdAt:{lt:new Date(now.getTime()-120000)}}]},orderBy:{createdAt:'asc'},take:101,select:{id:true,orderId:true,state:true,createdAt:true}}),
    prisma.paymentRefund.findMany({where:{state:{in:['PENDING','SUBMITTED','UNKNOWN','FAILED']},createdAt:{lt:new Date(now.getTime()-10*60000)},...(cityId?{order:{vendor:{cityId}}}:{})},orderBy:{createdAt:'asc'},take:101,select:{id:true,orderId:true,state:true,createdAt:true}}),
  ]);
  const creationOrderIds=creations.slice(0,100).map(c=>c.orderId);
  const visibleCreationOrders=creationOrderIds.length?await prisma.order.findMany({where:{id:{in:creationOrderIds},...(cityId?{vendor:{cityId}}:{})},select:{id:true}}):[];
  const visibleCreationIds=new Set(visibleCreationOrders.map(o=>o.id));
  const driverIds=[...new Set(orders.map(o=>o.driverId).filter((x):x is string=>!!x))];
  const fixes=driverIds.length?await prisma.driverLocation.findMany({where:{driverId:{in:driverIds}},select:{driverId:true,lastUpdated:true}}):[];
  const freshness=new Map(fixes.map(f=>[f.driverId,f.lastUpdated.getTime()]));
  const list:OperationalException[]=[];
  const add=(entry:OperationalException)=>list.push(entry);
  for(const o of orders.slice(0,300)) {
    const paid=o.paymentMethod==='COD'||o.paymentStatus==='PAID';
    const order=(key:string,title:string,severity:OperationalException['severity'],slaAt:Date|null,actions=['OPEN_ORDER'])=>add({key,title,severity,slaAt,referenceType:'ORDER',referenceId:o.id,orderId:o.id,createdAt:o.createdAt,ownerId:null,actions});
    const elapsed=(date:Date|null|undefined,minutes:number)=>!!date&&now.getTime()-date.getTime()>minutes*60000;
    if(paid&&o.status==='PLACED'&&elapsed(o.paidAt??o.createdAt,2))order('VENDOR_ACK','Store has not acknowledged the order','HIGH',new Date((o.paidAt??o.createdAt).getTime()+2*60000));
    if(o.status==='PREPARING'&&o.estimatedReadyAt&&o.estimatedReadyAt<now)order('PACKING_DELAY','Store preparation estimate elapsed','HIGH',o.estimatedReadyAt);
    if(o.status==='READY_FOR_PICKUP'&&!o.driverId)order('READY_NO_RIDER','Packed order has no assigned rider','HIGH',o.readyForPickupAt??o.updatedAt,['OPEN_ORDER','RETRY_DISPATCH']);
    if(!o.driverId&&['NO_ELIGIBLE_RIDER','OFFERS_EXHAUSTED','CAPACITY_UNAVAILABLE'].includes(o.dispatchNote??''))order('DISPATCH_BLOCKED',o.dispatchNote==='OFFERS_EXHAUSTED'?'Rider offer rounds exhausted':'No eligible delivery partner','HIGH',o.dispatchEscalatedAt,['OPEN_ORDER','RETRY_DISPATCH']);
    if(o.pickupArrivalAt&&!o.pickedUpAt&&elapsed(o.pickupArrivalAt,5))order('RIDER_WAITING','Rider waiting at store pickup','NORMAL',new Date(o.pickupArrivalAt.getTime()+5*60000));
    if(o.driverId&&!['DELIVERED','CANCELLED'].includes(o.status)&&now.getTime()-(freshness.get(o.driverId)??0)>120000)order('GPS_STALE','Assigned rider location needs refreshing','HIGH',null);
    if(o.pickedUpAt&&!['DELIVERED','CANCELLED'].includes(o.status)&&elapsed(o.pickedUpAt,45))order('DELIVERY_DELAY','Delivery needs an operator update','HIGH',new Date(o.pickedUpAt.getTime()+45*60000));
    if(o.paymentMethod!=='COD'&&o.paymentStatus==='FAILED')order('PAYMENT_FAILED','Customer payment attempt failed','NORMAL',null);
    if(['PENDING','FAILED'].includes(o.refundStatus??'')&&elapsed(o.cancelledAt??o.updatedAt,10))order('REFUND_DELAY','Refund needs provider reconciliation','URGENT',new Date((o.cancelledAt??o.updatedAt).getTime()+10*60000));
    if(o.inventoryReservations.some(r=>r.unusableQty>0||r.pendingInspectionQty>0))order('STOCK_REVIEW','Reserved or packed stock needs review','HIGH',null);
    for(const a of o.adjustments)order('SUBSTITUTION_PENDING','Customer decision needed for item change',a.expiresAt<now?'HIGH':'NORMAL',a.expiresAt);
    if(paid&&!['DELIVERED','CANCELLED'].includes(o.status)&&(o.vendor.approvalStatus!=='APPROVED'||o.driver?.driverProfile?.approvalStatus==='SUSPENDED'))order('PARTNER_SUSPENDED','An active order has a restricted partner','URGENT',null);
  }
  for(const c of cases.slice(0,100))add({key:'SUPPORT_OVERDUE',referenceType:'SUPPORT_CASE',referenceId:c.id,orderId:c.orderId,severity:c.priority==='URGENT'?'URGENT':'HIGH',title:'Support response is overdue',createdAt:c.createdAt,slaAt:c.dueAt,ownerId:c.assignedToId,actions:['OPEN_SUPPORT',...(c.orderId?['OPEN_ORDER']:[])]});
  for(const c of cash.slice(0,100))add({key:'CASH_REVIEW',referenceType:'CASH_COLLECTION',referenceId:c.id,orderId:c.orderId,severity:c.events.length?'HIGH':'NORMAL',title:c.events.length?'Cash mismatch or disputed handover':'Cash handover overdue',createdAt:c.collectedAt,slaAt:new Date(c.collectedAt.getTime()+86400000),ownerId:null,actions:['OPEN_CASH','OPEN_ORDER']});
  for(const c of creations.slice(0,100))if(visibleCreationIds.has(c.orderId))add({key:'PAYMENT_CREATE_UNKNOWN',referenceType:'ORDER',referenceId:c.orderId,orderId:c.orderId,severity:'URGENT',title:'Payment creation needs operator reconciliation; do not retry blindly',createdAt:c.createdAt,slaAt:null,ownerId:null,actions:['OPEN_ORDER','OPERATOR_REVIEW']});
  const refundOrders=new Set<string>();
  for(const r of refunds.slice(0,100)){if(refundOrders.has(r.orderId))continue;refundOrders.add(r.orderId);add({key:'PARTIAL_REFUND_DELAY',referenceType:'ORDER',referenceId:r.orderId,orderId:r.orderId,severity:r.state==='UNKNOWN'?'URGENT':'HIGH',title:'Item-change refund needs provider reconciliation',createdAt:r.createdAt,slaAt:new Date(r.createdAt.getTime()+10*60000),ownerId:null,actions:['OPEN_ORDER','OPERATOR_REVIEW']});}
  const resolutionMap=new Map(resolutions.map(r=>[`${r.exceptionKey}:${r.referenceType}:${r.referenceId}`,r]));
  for(const item of list){const resolution=resolutionMap.get(`${item.key}:${item.referenceType}:${item.referenceId}`);if(resolution){item.resolution=resolution;item.ownerId=resolution.ownerId??item.ownerId;}}
  const ranks={URGENT:0,HIGH:1,NORMAL:2};list.sort((a,b)=>ranks[a.severity]-ranks[b.severity]||a.createdAt.getTime()-b.createdAt.getTime());
  return {checkedAt:now,cityId:cityId??null,data:list,truncated:orders.length>300||cases.length>100||cash.length>100||creations.length>100||refunds.length>100,limits:{orders:300,support:100,cash:100}};
}
const clean=(value:unknown,field:string,max=500)=>{if(typeof value!=='string'||value.trim().length<5||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw new AppError(400,'BAD_OPERATION',`Enter a traceable ${field} of 5–${max} characters.`,field);return value.trim();};
export async function recordOperationalResolution(actorId:string,input:any) {
  if(!input||!['ORDER','SUPPORT_CASE','CASH_COLLECTION'].includes(input.referenceType)||typeof input.referenceId!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(input.referenceId))throw new AppError(400,'BAD_OPERATION','Choose a valid operational reference.');
  const keys=['VENDOR_ACK','PACKING_DELAY','READY_NO_RIDER','DISPATCH_BLOCKED','RIDER_WAITING','GPS_STALE','DELIVERY_DELAY','PAYMENT_FAILED','REFUND_DELAY','STOCK_REVIEW','SUBSTITUTION_PENDING','PARTNER_SUSPENDED','SUPPORT_OVERDUE','CASH_REVIEW','PAYMENT_CREATE_UNKNOWN','PARTIAL_REFUND_DELAY'];
  if(!keys.includes(input.exceptionKey)||!['ACKNOWLEDGED','ESCALATED','RESOLVED'].includes(input.state)||!Number.isInteger(input.version)||input.version<0)throw new AppError(400,'BAD_OPERATION','Choose a supported exception, state and version.');
  const reason=clean(input.reason,'reason'),evidenceReference=input.evidenceReference==null?null:clean(input.evidenceReference,'evidenceReference',120);
  if(input.state==='RESOLVED'&&!evidenceReference)throw new AppError(400,'EVIDENCE_REQUIRED','A resolution needs traceable evidence.');
  // Active underlying conditions cannot be hidden by a dashboard-only resolution. Use existing order/refund/dispatch actions first.
  if(input.state==='RESOLVED') {
    const active=await operationalExceptions();
    if(active.truncated||active.data.some(e=>e.key===input.exceptionKey&&e.referenceType===input.referenceType&&e.referenceId===input.referenceId))throw new AppError(409,'EXCEPTION_STILL_ACTIVE','The underlying exception is still active. Use the order, support or cash recovery workflow first, or escalate it.');
  }
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ops-resolution:${input.exceptionKey}:${input.referenceType}:${input.referenceId}`}))::text`;
    const reference=input.referenceType==='ORDER'?await tx.order.findUnique({where:{id:input.referenceId},select:{id:true}}):input.referenceType==='SUPPORT_CASE'?await tx.supportCase.findUnique({where:{id:input.referenceId},select:{id:true}}):await tx.cashCollection.findUnique({where:{id:input.referenceId},select:{id:true}});
    if(!reference)throw new AppError(404,'NOT_FOUND','Operational reference not found.');
    const ownerId=input.ownerId===undefined||input.ownerId===null?null:typeof input.ownerId==='string'?input.ownerId:'';
    if(input.ownerId!==undefined&&input.ownerId!==null){if(!ownerId)throw new AppError(400,'BAD_OPERATION','Choose an active administrator as owner.');await activeSupportAdmin(tx,ownerId);}
    const where={exceptionKey_referenceType_referenceId:{exceptionKey:input.exceptionKey,referenceType:input.referenceType,referenceId:input.referenceId}};
    const before=await tx.operationalResolution.findUnique({where});
    if((before?.version??0)!==input.version)throw new AppError(409,'OPERATION_VERSION_CONFLICT','Another operator updated this exception. Refresh before making a decision.');
    const data={state:input.state,reason,evidenceReference,ownerId,actorId};
    const row=before?await tx.operationalResolution.update({where:{id:before.id},data:{...data,version:{increment:1}}}):await tx.operationalResolution.create({data:{...data,exceptionKey:input.exceptionKey,referenceType:input.referenceType,referenceId:input.referenceId}});
    await tx.adminAuditLog.create({data:{action:'OPERATION_RESOLUTION_RECORDED',targetType:input.referenceType,targetId:input.referenceId,summary:`Admin ${actorId} recorded ${input.state} for ${input.exceptionKey}; version ${row.version}; owner ${ownerId??'unassigned'}; reason: ${reason}${evidenceReference?`; evidence: ${evidenceReference}`:''}. No money transfer or order state mutation.`}});
    return row;
  });
}
export const runSupportEscalation=escalateOverdueSupportCases;
