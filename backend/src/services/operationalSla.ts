import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { vendorAcceptWindowMin } from '../config/orderFlow';
import { fulfillmentWhere } from './marketplace';
import { ORDER_VIEW_INCLUDE, OrderWithRelations } from './orderView';
import { readyAt } from './preparation';

export type SlaPolicy={packingDelayMinutes:number;riderSearchMinutes:number;pickupDelayMinutes:number;deliveryDelayMinutes:number;missingUpdateMinutes:number;acceptanceWarningPercent:number};
export const DEFAULT_SLA:SlaPolicy={packingDelayMinutes:5,riderSearchMinutes:5,pickupDelayMinutes:15,deliveryDelayMinutes:60,missingUpdateMinutes:5,acceptanceWarningPercent:70};
const bounds:Record<keyof SlaPolicy,[number,number]>={packingDelayMinutes:[1,60],riderSearchMinutes:[1,30],pickupDelayMinutes:[3,60],deliveryDelayMinutes:[10,180],missingUpdateMinutes:[2,15],acceptanceWarningPercent:[40,90]};
export function validateSlaPolicy(raw:unknown):SlaPolicy {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AppError(400,'BAD_SLA_POLICY','Supply all supported SLA thresholds.');
  const value=raw as Record<string,unknown>;
  if(Object.keys(value).some(k=>!(k in bounds)))throw new AppError(400,'BAD_SLA_POLICY','Unknown SLA threshold.');
  for(const key of Object.keys(bounds) as (keyof SlaPolicy)[]) {const n=value[key],[min,max]=bounds[key];if(typeof n!=='number'||!Number.isInteger(n)||n<min||n>max)throw new AppError(400,'BAD_SLA_POLICY',`${key} must be an integer from ${min} to ${max}.`);}
  return value as SlaPolicy;
}
export async function getSlaPolicy(){const row=await prisma.appSetting.findUnique({where:{key:'operational_sla'}});try{return row?validateSlaPolicy(row.value):{...DEFAULT_SLA};}catch{return {...DEFAULT_SLA};}}
export function slaExceptions(o:OrderWithRelations,policy:SlaPolicy,now=new Date()) {
  const alerts:{key:string;severity:'WARNING'|'CRITICAL';deadlineAt:string;message:string}[]=[];
  const add=(key:string,at:Date,message:string,severity:'WARNING'|'CRITICAL'='WARNING')=>{if(now>=at)alerts.push({key,severity,deadlineAt:at.toISOString(),message});};
  if(['CANCELLED','DELIVERED'].includes(o.status))return alerts;
  const base=o.paidAt??o.createdAt;
  if(o.status==='PLACED')add('VENDOR_ACKNOWLEDGMENT',new Date(base.getTime()+vendorAcceptWindowMin()*60000*policy.acceptanceWarningPercent/100),'Store response deadline is approaching. Contact the store; automatic cancellation remains bounded.');
  const ready=readyAt(o);
  if(['ACCEPTED','PREPARING'].includes(o.status)&&ready)add('PACKING_DELAY',new Date(ready.getTime()+policy.packingDelayMinutes*60000),'Store packing is delayed. Check stock/preparation and update the customer.');
  if(['ACCEPTED','PREPARING','READY_FOR_PICKUP'].includes(o.status)&&!o.driverId&&o.dispatchSearchStartedAt)add('RIDER_SEARCH_DELAY',new Date(o.dispatchSearchStartedAt.getTime()+policy.riderSearchMinutes*60000),'No rider has accepted. Review recovery deadline, assignment and cancellation/refund options.','CRITICAL');
  if(o.status==='READY_FOR_PICKUP'&&o.driverId)add('PICKUP_DELAY',new Date((o.readyForPickupAt??ready??o.updatedAt).getTime()+policy.pickupDelayMinutes*60000),'Assigned rider has not collected the ready order.');
  if(['PICKED_UP','ARRIVED_AT_GATE'].includes(o.status)&&o.pickedUpAt)add('DELIVERY_DELAY',new Date(o.pickedUpAt.getTime()+policy.deliveryDelayMinutes*60000),'Delivery is delayed. Contact the rider and customer; do not bypass proof.','CRITICAL');
  return alerts;
}
/** Durable exceptions are inserted under an order lock; duplicate workers do not create repeated audit/notifications. */
export async function runSlaMaintenance(now=new Date(),signal?:AbortSignal) {
  const policy=await getSlaPolicy();
  const orders=await prisma.order.findMany({where:{workflowVersion:2,status:{in:['PLACED','ACCEPTED','PREPARING','READY_FOR_PICKUP','PICKED_UP','ARRIVED_AT_GATE']},AND:[fulfillmentWhere]},include:ORDER_VIEW_INCLUDE,orderBy:{createdAt:'asc'},take:100});let raised=0;
  for(const row of orders) {
    if(signal?.aborted)break;
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${row.id} FOR UPDATE`;
      const o=await tx.order.findUniqueOrThrow({where:{id:row.id},include:ORDER_VIEW_INCLUDE});
      const alerts=slaExceptions(o,policy,now);
      if(o.driverId&&['PICKED_UP','ARRIVED_AT_GATE'].includes(o.status)) {
        const fix=await tx.driverLocation.findUnique({where:{driverId:o.driverId}});
        const since=fix?.lastUpdated??o.pickedUpAt??o.updatedAt;
        if(now.getTime()-since.getTime()>policy.missingUpdateMinutes*60000)alerts.push({key:'MISSING_LOCATION_UPDATE',severity:'CRITICAL',deadlineAt:new Date(since.getTime()+policy.missingUpdateMinutes*60000).toISOString(),message:'Delivery location updates are stale. Ask the assigned rider to refresh GPS.'});
      }
      for(const alert of alerts) {
        const unique={exceptionKey:alert.key,referenceType:'ORDER',referenceId:o.id};
        if(await tx.operationalResolution.findUnique({where:{exceptionKey_referenceType_referenceId:unique}}))continue;
        await tx.operationalResolution.create({data:{...unique,state:'OPEN',reason:alert.message,actorId:'system'}});
        await tx.adminAuditLog.create({data:{action:'OPERATIONAL_SLA_ESCALATED',targetType:'ORDER',targetId:o.id,summary:`${alert.severity}: ${alert.key}; deadline ${alert.deadlineAt}. ${alert.message}`}});
        if(alert.key==='VENDOR_ACKNOWLEDGMENT')await tx.notificationIntent.create({data:{orderId:o.id,event:'NEW_ORDER_REMINDER',options:{bucket:Math.floor(now.getTime()/60000)}}});
        raised++;
      }
    });
  }
  return raised;
}
