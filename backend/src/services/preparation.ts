import { AppError } from '../utils/appError';
import { TravelEstimate, fallbackTravelEstimate } from './routing';

type PreparationOrder = {
  workflowVersion:number;status:string;createdAt:Date;acceptedAt?:Date|null;driverId?:string|null;
  estimatedReadyAt?:Date|null;preparationMinutes?:number|null;readyForPickupAt?:Date|null;
  riderArrivedPickupAt?:Date|null;dispatchSearchStartedAt?:Date|null;dispatchOverrideUntil?:Date|null;
  pickedUpAt?:Date|null;deliveredAt?:Date|null;dispatchNote?:string|null;
  vendor:{lat:number;lng:number;preparationMinutes?:number;};addressSnapshot?:unknown;
};
export const preparationMinutes=(value:unknown,fallback=10)=>{
  if(value===undefined||value===null)return fallback;
  if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>120)throw new AppError(400,'BAD_PREPARATION_TIME','Choose a packing estimate between 1 and 120 minutes.','preparationMinutes');
  return value;
};
export function readyAt(order:PreparationOrder):Date|null {
  if(order.status==='READY_FOR_PICKUP'||order.readyForPickupAt)return order.readyForPickupAt??order.estimatedReadyAt??order.acceptedAt??order.createdAt;
  if(order.estimatedReadyAt)return order.estimatedReadyAt;
  if(order.workflowVersion!==2||!['ACCEPTED','PREPARING'].includes(order.status))return null;
  return new Date((order.acceptedAt??order.createdAt).getTime()+preparationMinutes(order.preparationMinutes,preparationMinutes(order.vendor.preparationMinutes))*60_000);
}
/** Returns only additive timing columns for the existing locked state transition. */
export function preparationTransitionData(order:PreparationOrder,status:string,now=new Date(),minutes?:unknown) {
  if(order.workflowVersion!==2)return {};
  if(status==='ACCEPTED') {
    const estimate=preparationMinutes(minutes,preparationMinutes(order.vendor.preparationMinutes));
    return {preparationMinutes:estimate,estimatedReadyAt:new Date(now.getTime()+estimate*60_000)};
  }
  if(status==='PREPARING')return {packingStartedAt:now,...(!order.estimatedReadyAt?{estimatedReadyAt:readyAt({...order,status:'PREPARING'})}: {})};
  if(status==='READY_FOR_PICKUP')return {readyForPickupAt:now,estimatedReadyAt:now,dispatchNextAttemptAt:null};
  return {};
}
export function dispatchTiming(order:PreparationOrder,travel:Pick<TravelEstimate,'durationSeconds'>,now=new Date()) {
  if(order.workflowVersion!==2||order.status==='READY_FOR_PICKUP'||(order.dispatchOverrideUntil&&order.dispatchOverrideUntil>now))return {eligible:true,nextSearchAt:now};
  const ready=readyAt(order);if(!ready)return {eligible:true,nextSearchAt:now};
  const delay=Math.max(15,Math.min(120,Number(process.env.DISPATCH_EXPECTED_MATCH_SECONDS)||45));
  const allowedWait=Math.max(0,Math.min(180,Number(process.env.PICKUP_EARLY_WAIT_SECONDS)||60));
  const next=new Date(ready.getTime()-(travel.durationSeconds+delay+allowedWait)*1000);
  return {eligible:next<=now,nextSearchAt:next};
}
export const capacityRecoveryDeadline=(order:PreparationOrder)=>new Date((readyAt(order)??order.acceptedAt??order.createdAt).getTime()+Math.max(5,Math.min(60,Number(process.env.NO_RIDER_RECOVERY_MINUTES)||15))*60_000);

/** Shared REST/socket presentation; no customer data or private rider location is included. */
export function fulfillmentProgress(order:PreparationOrder,now=new Date()) {
  if(order.workflowVersion!==2)return undefined;
  const ready=readyAt(order),address=order.addressSnapshot as {lat?:number;lng?:number}|null;
  let travel:TravelEstimate|undefined;
  if(typeof address?.lat==='number'&&typeof address.lng==='number') {
    try{travel=fallbackTravelEstimate(order.vendor,{lat:address.lat,lng:address.lng},now);}catch{/* Missing configured pins are reported by serviceability, never invented here. */}
  }
  let phase='WAITING_FOR_STORE';
  if(order.status==='CANCELLED')phase='CANCELLED';
  else if(order.status==='DELIVERED')phase='DELIVERED';
  else if(['PICKED_UP','ARRIVED_AT_GATE'].includes(order.status))phase='OUT_FOR_DELIVERY';
  else if(order.riderArrivedPickupAt)phase='RIDER_WAITING_AT_PICKUP';
  else if(order.driverId)phase='RIDER_ASSIGNED';
  else if(order.dispatchSearchStartedAt)phase='FINDING_DELIVERY_PARTNER';
  else if(order.status==='READY_FOR_PICKUP')phase='READY_FINDING_PARTNER';
  else if(['ACCEPTED','PREPARING'].includes(order.status))phase='PREPARING';
  const anchor=order.pickedUpAt??new Date(Math.max(now.getTime(),ready?.getTime()??now.getTime()));
  const seconds=travel?.durationSeconds??null;
  return {phase,estimatedReadyAt:ready?.toISOString()??null,preparationMinutes:order.preparationMinutes??null,
    riderAtPickup:!!order.riderArrivedPickupAt,preparationStatus:order.status==='READY_FOR_PICKUP'?'READY':order.status==='PREPARING'?'PACKING':order.status==='ACCEPTED'?'ACCEPTED':null,
    estimatedDeliveryFrom:seconds&&phase!=='DELIVERED'&&phase!=='CANCELLED'?new Date(anchor.getTime()+seconds*1000).toISOString():null,
    estimatedDeliveryBy:seconds&&phase!=='DELIVERED'&&phase!=='CANCELLED'?new Date(anchor.getTime()+(seconds+600)*1000).toISOString():null,
    etaSource:travel?.source??'UNAVAILABLE',estimated:true,delayReason:order.dispatchNote??null,recoveryDeadlineAt:!order.driverId&&['ACCEPTED','PREPARING','READY_FOR_PICKUP'].includes(order.status)?capacityRecoveryDeadline(order).toISOString():null};
}
