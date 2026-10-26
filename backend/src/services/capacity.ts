import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { DeliveryAddress, deliveryEligibility, kmBetween } from './geography';
import { AppError } from '../utils/appError';
import { fallbackTravelEstimate } from './routing';
import { ACTIVE_RIDER_STATUSES } from './orderView';

type Db=Prisma.TransactionClient|typeof prisma;
export type CapacityDecision={state:'AVAILABLE'|'CONSTRAINED'|'UNAVAILABLE';canCheckout:boolean;onlineAllowed:boolean;reason:string;message:string;eligibleRiders:number;pendingOrders:number;estimatedDeliveryMinMinutes:number;estimatedDeliveryMaxMinutes:number;routingSource:string;checkedAt:string;validUntil:string;recoveryDeadlineAt:string|null};
const bounded=(name:string,fallback:number,min:number,max:number)=>{const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?Math.max(min,Math.min(max,n)):fallback;};
/** Pure decision engine. A queue is COD-only, bounded and explicitly enabled; it never implies guaranteed fulfillment. */
export function capacityDecision(input:{eligibleRiders:number;pendingOrders:number;preparationMinutes:number;maxPreparingOrders:number;deliverySeconds:number;busy:boolean;outage:boolean},now=new Date()):CapacityDecision {
  const queue=process.env.CAPACITY_COD_QUEUE_ENABLED==='true',limit=bounded('CAPACITY_MAX_QUEUED_ORDERS',2,1,10);
  const viable=!input.outage&&!input.busy&&input.eligibleRiders>0&&input.pendingOrders<input.maxPreparingOrders;
  const spare=input.eligibleRiders-input.pendingOrders;
  const available=viable&&spare>0;
  const constrained=viable&&!available&&queue&&input.pendingOrders<limit;
  const canCheckout=available||constrained;
  const reason=input.outage?'DELIVERY_PAUSED':input.busy?'STORE_BUSY':input.pendingOrders>=input.maxPreparingOrders?'STORE_AT_CAPACITY':input.eligibleRiders===0?'NO_RIDERS_AVAILABLE':!available?'DELIVERY_CAPACITY_CONSTRAINED':'CAPACITY_AVAILABLE';
  const prep=Math.max(1,input.preparationMinutes),min=Math.ceil(prep+input.deliverySeconds/60+3+(constrained?10:0));
  return {state:available?'AVAILABLE':constrained?'CONSTRAINED':'UNAVAILABLE',canCheckout,onlineAllowed:available,reason,
    message:available?'Delivery partners are currently available.':constrained?'Delivery is busy. Cash orders may enter a short queue; assignment is not guaranteed.':'Delivery is temporarily unavailable. Try again later or choose another store.',eligibleRiders:input.eligibleRiders,pendingOrders:input.pendingOrders,
    estimatedDeliveryMinMinutes:min,estimatedDeliveryMaxMinutes:min+(constrained?25:15),routingSource:'DISTANCE_ESTIMATE',checkedAt:now.toISOString(),validUntil:new Date(now.getTime()+15000).toISOString(),recoveryDeadlineAt:constrained?new Date(now.getTime()+bounded('NO_RIDER_RECOVERY_MINUTES',15,5,60)*60000).toISOString():null};
}
/** Recheck with the same transaction as checkout. The zone-scoped lock serializes concurrent demand commits.
 * No provider network calls or connection-pool re-entry occurs here. Quotes remain a short-lived estimate. */
export async function assessFulfillmentCapacity(db:Db,vendorId:string,address:DeliveryAddress,options:{lock?:boolean;paymentMethod?:'ONLINE'|'COD';excludeOrderId?:string;now?:Date}={}) {
  const now=options.now??new Date(),eligibility=await deliveryEligibility(db,address,vendorId,options.lock,now);
  if(options.lock)await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`capacity:${eligibility.zoneId}`},0))::text`;
  const vendor=await db.vendor.findUniqueOrThrow({where:{id:vendorId}});
  const candidates=await db.driverPartner.findMany({where:{approvalStatus:'APPROVED',dutyStatus:'ONLINE',cityId:address.cityId,userId:{not:null},user:{is:{role:'DRIVER',deletedAt:null}},availabilityAt:{gte:new Date(now.getTime()-120000),lte:now},serviceZone:{is:{active:true,city:{active:true}}}},include:{serviceZone:true,user:{select:{clerkUserId:true}}}});
  const active=await db.order.findMany({where:{status:{in:[...ACTIVE_RIDER_STATUSES]},driverId:{in:candidates.map(r=>r.userId!)}},select:{driverId:true}}),occupied=new Set(active.map(o=>o.driverId));
  const states=await db.clerkIdentityState.findMany({where:{clerkUserId:{in:candidates.flatMap(r=>r.user?.clerkUserId?[r.user.clerkUserId]:[])},OR:[{suspended:true},{deleted:true},{deleteRequested:true}]},select:{clerkUserId:true}}),blocked=new Set(states.map(s=>s.clerkUserId));
  const fresh=candidates.filter(r=>!occupied.has(r.userId)&&!blocked.has(r.user?.clerkUserId??'')&&r.availabilityLat!=null&&r.availabilityLng!=null&&kmBetween({lat:r.availabilityLat,lng:r.availabilityLng},vendor)<=5&&r.serviceZone&&kmBetween(vendor,{lat:r.serviceZone.centerLat,lng:r.serviceZone.centerLng})<=r.serviceZone.radiusKm&&kmBetween(address,{lat:r.serviceZone.centerLat,lng:r.serviceZone.centerLng})<=r.serviceZone.radiusKm);
  // Include unpaid new checkouts: otherwise concurrent payment starts can oversell the same delivery capacity.
  const demand=await db.order.count({where:{vendor:{cityId:address.cityId},driverId:null,status:{in:['PLACED','ACCEPTED','PREPARING','READY_FOR_PICKUP']},workflowVersion:2,...(options.excludeOrderId?{id:{not:options.excludeOrderId}}:{})}});
  const travel=fallbackTravelEstimate(vendor,address,now);
  return capacityDecision({eligibleRiders:fresh.length,pendingOrders:demand,preparationMinutes:vendor.preparationMinutes,maxPreparingOrders:vendor.maxPreparingOrders,deliverySeconds:travel.durationSeconds,busy:!!vendor.busyUntil&&vendor.busyUntil>now,outage:process.env.DELIVERY_SERVICE_PAUSED==='true'},now);
}
export async function requireFulfillmentCapacity(db:Db,vendorId:string,address:DeliveryAddress,options:Parameters<typeof assessFulfillmentCapacity>[3]={}) {
  const capacity=await assessFulfillmentCapacity(db,vendorId,address,options);
  if(!capacity.canCheckout||(options.paymentMethod??'ONLINE')==='ONLINE'&&!capacity.onlineAllowed)throw new AppError(409,'DELIVERY_CAPACITY_UNAVAILABLE',capacity.message);
  return capacity;
}
