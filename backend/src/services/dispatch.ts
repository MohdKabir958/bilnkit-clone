import { drainNotificationIntents } from './push/intents';
import { Prisma, DriverPartner, DeliveryZone, City, DispatchOffer } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { dropPointCoords } from '../config/campus';
import { kmBetween } from './geography';
import { lockGroupRows } from './groupLock';
import { ACTIVE_RIDER_STATUSES, ORDER_VIEW_INCLUDE, OrderWithRelations, isPoolEligible } from './orderView';

type Tx = Prisma.TransactionClient;
type Rider = DriverPartner & { serviceZone: (DeliveryZone & { city: City }) | null };
const POOL = ['ACCEPTED','PREPARING','READY_FOR_PICKUP'] as const;
const ttlMs = () => { const n=Number(process.env.DISPATCH_OFFER_SECONDS ?? 45);return (Number.isFinite(n)?Math.min(120,Math.max(15,n)):45)*1000; };
export const MAX_DISPATCH_OFFERS = 3;
let publisher: (o:OrderWithRelations,userId:string,offer:{id:string;expiresAt:Date})=>Promise<void> = async()=>{};
export function setDispatchPublisher(fn:typeof publisher) {publisher=fn;}

export function riderServesOrders(rider:Rider, orders:OrderWithRelations[]) {
  const z=rider.serviceZone;
  if(!z || !z.active || !z.city.active || rider.cityId!==z.cityId) return false;
  return orders.every((o)=>{
    const a=o.addressSnapshot as any;
    // Historical order pins remain readable; every new checkout stores its own structured snapshot.
    const delivery=a && typeof a.lat==='number' && typeof a.lng==='number' ? a : dropPointCoords(o.dropoffHostel);
    return o.vendor.cityId===z.cityId && delivery && kmBetween({lat:z.centerLat,lng:z.centerLng},o.vendor)<=z.radiusKm && kmBetween({lat:z.centerLat,lng:z.centerLng},delivery)<=z.radiusKm;
  });
}
async function lockedOrders(tx:Tx,id:string) {
  const meta=await tx.order.findUnique({where:{id},select:{groupId:true}});
  if(!meta) return [];
  if(meta.groupId) {await lockGroupRows(tx,meta.groupId);return tx.order.findMany({where:{groupId:meta.groupId},include:ORDER_VIEW_INCLUDE,orderBy:{groupIndex:'asc'}});}
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE`;
  const o=await tx.order.findUnique({where:{id},include:ORDER_VIEW_INCLUDE});return o?[o]:[];
}
const claimable=(orders:OrderWithRelations[])=>orders.length>0 && orders.every((o)=>o.paymentStatus==='PAID'&&!o.driverId&&(POOL as readonly string[]).includes(o.status));
async function expire(tx:Tx,id:string,now:Date) {await tx.dispatchOffer.updateMany({where:{orderId:id,state:'PENDING',expiresAt:{lte:now}},data:{state:'EXPIRED',reason:'Offer timed out'}});}
async function markAttention(id:string,now:Date,reason:string) {
  await prisma.$transaction(async(tx)=>{
    const orders=await lockedOrders(tx,id);if(!claimable(orders)) return;
    const o=orders[0];await expire(tx,o.id,now);
    if(await tx.dispatchOffer.count({where:{orderId:o.id,state:'PENDING',expiresAt:{gt:now}}})) return;
    await tx.order.update({where:{id:o.id},data:{dispatchNote:reason,dispatchEscalatedAt:now,dispatchNextAttemptAt:reason==='NO_ELIGIBLE_RIDER'?new Date(now.getTime()+60000):null}});
  });
}

/** Driver -> group -> orders everywhere, matching claim/reassignment. No location is
 * collected from idle riders: operator-confirmed service circles supply dispatch geography. */
export async function ensureDispatchOffer(orderId:string,now=new Date()):Promise<DispatchOffer|undefined> {
  const first=await prisma.order.findUnique({where:{id:orderId},include:ORDER_VIEW_INCLUDE});
  if(!first || !isPoolEligible(first)) return;
  const orderIdPrimary=first.groupId ? first.group!.orders.find((c)=>c.groupIndex===0)!.id : first.id;
  if(orderIdPrimary!==first.id) return ensureDispatchOffer(orderIdPrimary,now);
  const pending=await prisma.dispatchOffer.findFirst({where:{orderId:first.id,state:'PENDING',expiresAt:{gt:now}}});
  if(pending) return;
  const attempts=await prisma.dispatchOffer.findMany({where:{orderId:first.id,round:first.dispatchRound},select:{driverId:true}});
  if(attempts.length>=MAX_DISPATCH_OFFERS) {await markAttention(first.id,now,'OFFERS_EXHAUSTED');return;}
  const children=first.groupId ? await prisma.order.findMany({where:{groupId:first.groupId},include:ORDER_VIEW_INCLUDE,orderBy:{groupIndex:'asc'}}) : [first];
  const candidates=await prisma.driverPartner.findMany({where:{approvalStatus:'APPROVED',dutyStatus:'ONLINE',userId:{not:null},cityId:first.vendor.cityId,serviceZone:{is:{active:true,city:{active:true}}},user:{is:{deletedAt:null,role:'DRIVER'}}},include:{serviceZone:{include:{city:true}}},orderBy:[{lastOfferedAt:{sort:'asc',nulls:'first'}},{id:'asc'}]});
  for(const candidate of candidates.filter((r)=>!attempts.some((a)=>a.driverId===r.id)&&riderServesOrders(r,children))) {
    const created=await prisma.$transaction(async(tx)=>{
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "DriverPartner" WHERE "id"=${candidate.id} FOR UPDATE SKIP LOCKED`;
      if(!locked.length) return null;
      const rider=await tx.driverPartner.findUniqueOrThrow({where:{id:candidate.id},include:{serviceZone:{include:{city:true}}}});
      if(rider.approvalStatus!=='APPROVED'||rider.dutyStatus!=='ONLINE'||!rider.userId) return null;
      if(await tx.order.count({where:{driverId:rider.userId,status:{in:[...ACTIVE_RIDER_STATUSES]}}})) return null;
      if(await tx.dispatchOffer.count({where:{driverId:rider.id,state:'PENDING',expiresAt:{gt:now}}})) return null;
      const orders=await lockedOrders(tx,first.id);if(!claimable(orders)||!riderServesOrders(rider,orders)) return null;
      const o=orders[0];await expire(tx,o.id,now);
      if(await tx.dispatchOffer.count({where:{orderId:o.id,state:'PENDING',expiresAt:{gt:now}}})) return null;
      const offered=await tx.dispatchOffer.findMany({where:{orderId:o.id,round:o.dispatchRound}});
      if(offered.length>=MAX_DISPATCH_OFFERS||offered.some((a)=>a.driverId===rider.id)) return null;
      const offer=await tx.dispatchOffer.create({data:{orderId:o.id,driverId:rider.id,round:o.dispatchRound,expiresAt:new Date(now.getTime()+ttlMs())}});
      await tx.driverPartner.update({where:{id:rider.id},data:{lastOfferedAt:now}});
      await tx.order.update({where:{id:o.id},data:{dispatchNextAttemptAt:offer.expiresAt,dispatchNote:null,dispatchEscalatedAt:null}});
      await tx.adminAuditLog.create({data:{action:'DELIVERY_OFFERED',targetType:'ORDER',targetId:o.id,summary:`Offered to rider ${rider.id}; round ${o.dispatchRound}`}});
      // FCM intent commits with the offer; the worker suppresses stale offers at dispatch time.
      await tx.notificationIntent.create({data:{orderId:o.id,event:'NEW_DELIVERY',options:{userId:rider.userId,bucket:o.dispatchRound}}});
      return {o,userId:rider.userId,offer};
    },{maxWait:15000,timeout:30000});
    if(created) {drainNotificationIntents();await publisher(created.o,created.userId,created.offer).catch(()=>console.error('Dispatch socket delivery failed.'));return created.offer;}
  }
  await markAttention(first.id,now,'NO_ELIGIBLE_RIDER');
}
export async function runDispatchMaintenance(now=new Date(),cityId?:string,wakeUnserved=false) {
  const ids=await prisma.order.findMany({where:{driverId:null,paymentStatus:'PAID',status:{in:[...POOL]},...(cityId?{vendor:{cityId}}:{}),AND:[{OR:[{groupId:null},{groupIndex:0}]},{OR:[{dispatchNextAttemptAt:null},{dispatchNextAttemptAt:{lte:now}},...(wakeUnserved?[{dispatchOffers:{none:{state:'PENDING',expiresAt:{gt:now}}}}]:[])]},{OR:[{dispatchEscalatedAt:null},{dispatchNote:'NO_ELIGIBLE_RIDER',...(wakeUnserved?{}:{dispatchNextAttemptAt:{lte:now}})}]}]},select:{id:true},orderBy:{createdAt:'asc'},take:100});
  for(const o of ids) await ensureDispatchOffer(o.id,now);
  return ids.length;
}
export async function acceptDispatchOffer(tx:Tx,orders:OrderWithRelations[],riderUserId:string,now=new Date()) {
  const rider=await tx.driverPartner.findUnique({where:{userId:riderUserId},include:{serviceZone:{include:{city:true}}}});
  if(!rider||!riderServesOrders(rider,orders)) throw new AppError(409,'SERVICE_AREA_REQUIRED','This delivery is outside your configured service area. Ask operations to check your area.');
  const primary=orders[0];
  const offer=await tx.dispatchOffer.findUnique({where:{orderId_driverId_round:{orderId:primary.id,driverId:rider.id,round:primary.dispatchRound}}});
  if(!offer || offer.state!=='PENDING' || offer.expiresAt<=now) throw new AppError(409,'OFFER_EXPIRED','This delivery offer is no longer available. Refresh your offers.');
  await tx.dispatchOffer.update({where:{id:offer.id},data:{state:'ACCEPTED'}});
  await tx.dispatchOffer.updateMany({where:{orderId:primary.id,state:'PENDING',id:{not:offer.id}},data:{state:'REVOKED',reason:'Assigned to another rider'}});
  await tx.order.update({where:{id:primary.id},data:{dispatchNote:null,dispatchNextAttemptAt:null,dispatchEscalatedAt:null}});
}
export async function declineDispatchOffer(offerId:string,userId:string,reason:string,now=new Date()) {
  const rider=await prisma.driverPartner.findUnique({where:{userId}});
  if(!rider) throw new AppError(404,'NOT_FOUND','Offer not found.');
  const offer=await prisma.dispatchOffer.findFirst({where:{id:offerId,driverId:rider.id}});
  if(!offer) throw new AppError(404,'NOT_FOUND','Offer not found.');
  await prisma.$transaction(async(tx)=>{
    await tx.$queryRaw`SELECT "id" FROM "DriverPartner" WHERE "id"=${rider.id} FOR UPDATE`;
    const orders=await lockedOrders(tx,offer.orderId);const current=await tx.dispatchOffer.findUniqueOrThrow({where:{id:offerId}});
    if(!claimable(orders)||current.state!=='PENDING'||current.expiresAt<=now) throw new AppError(409,'OFFER_EXPIRED','This offer is already closed.');
    await tx.dispatchOffer.update({where:{id:offerId},data:{state:'DECLINED',reason}});
    await tx.order.update({where:{id:orders[0].id},data:{dispatchNextAttemptAt:now}});
    await tx.adminAuditLog.create({data:{action:'DELIVERY_OFFER_DECLINED',targetType:'ORDER',targetId:offer.orderId,summary:`Rider ${rider.id}: ${reason}`}});
  });
  await ensureDispatchOffer(offer.orderId,now);
}
