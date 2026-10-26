import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { indianPoint, kmBetween } from './geography';
type Db=Prisma.TransactionClient|typeof prisma;
export type GpsMetadata={accuracyMeters?:unknown;measuredAt?:unknown};
type Fix={lat:number;lng:number;accuracyMeters:number|null;measuredAt:Date|null};
const error=(code:string,message:string)=>new AppError(409,code,message);
/** Device timestamps and uncertainty are preserved, not replaced with receipt time. No GPS feed can prove hardware authenticity. */
export function validateGpsFix(lat:unknown,lng:unknown,metadata:GpsMetadata={},previous?:Fix|null,now=new Date()):Fix {
  if(!indianPoint(lat,lng))throw new AppError(400,'BAD_COORDINATES','Choose valid Indian coordinates.');
  const supplied=metadata.accuracyMeters!==undefined||metadata.measuredAt!==undefined;
  if(!supplied)return {lat:lat as number,lng:lng as number,accuracyMeters:null,measuredAt:null}; // compatibility ingestion; not sufficient for v2 arrival proof
  if(typeof metadata.accuracyMeters!=='number'||!Number.isFinite(metadata.accuracyMeters)||metadata.accuracyMeters<0||metadata.accuracyMeters>2000)throw error('GPS_ACCURACY_INVALID','Refresh location outdoors and send the measured GPS accuracy.');
  const at=typeof metadata.measuredAt==='string'||typeof metadata.measuredAt==='number'?new Date(metadata.measuredAt):null;
  if(!at||!Number.isFinite(at.getTime())||at.getTime()>now.getTime()+15000||now.getTime()-at.getTime()>120000)throw error('GPS_TIMESTAMP_INVALID','This GPS reading is old or its device time is incorrect. Refresh GPS and enable automatic date and time.');
  if(previous?.measuredAt&&at<=previous.measuredAt)throw error('GPS_REPLAYED','This location reading was already received. Request a new GPS reading.');
  if(previous?.measuredAt&&previous.accuracyMeters!=null) {
    const seconds=(at.getTime()-previous.measuredAt.getTime())/1000;
    const metres=kmBetween(previous,{lat:lat as number,lng:lng as number})*1000;
    if(seconds>0&&seconds<300&&metres>seconds*40+previous.accuracyMeters+metadata.accuracyMeters+100)throw error('GPS_IMPOSSIBLE_MOVEMENT','This location moved too far too quickly. Refresh GPS; contact support if the store pin is wrong.');
  }
  return {lat:lat as number,lng:lng as number,accuracyMeters:metadata.accuracyMeters,measuredAt:at};
}
export function arrivalProblem(fix:(Fix&{lastUpdated:Date})|null,point:{lat:number;lng:number}|null,now=new Date()):AppError|null {
  if(!point||!fix||now.getTime()-fix.lastUpdated.getTime()>120000||fix.lastUpdated>now)return error('ARRIVAL_LOCATION_REQUIRED','Refresh your GPS near the confirmed pickup or delivery pin before continuing.');
  if(fix.accuracyMeters==null||!fix.measuredAt)return error('GPS_ACCURACY_REQUIRED','Update the Grozo rider app and refresh GPS so its accuracy can be checked.');
  if(now.getTime()-fix.measuredAt.getTime()>120000||fix.measuredAt.getTime()>now.getTime()+15000)return error('GPS_TIMESTAMP_INVALID','Refresh your GPS reading before confirming arrival.');
  const raw=Number(process.env.ARRIVAL_MAX_ACCURACY_METERS),maximum=Number.isFinite(raw)&&raw>0?Math.max(20,Math.min(150,raw)):100;
  if(fix.accuracyMeters>maximum)return error('GPS_WEAK_ACCURACY','GPS accuracy is weak. Move outdoors, enable precise location and refresh. Ask support to check an incorrect pin.');
  if(kmBetween(fix,point)>0.2)return error('ARRIVAL_LOCATION_REQUIRED','You are away from the confirmed pin. Navigate to it, refresh GPS, or request a pin review from support.');
  return null;
}
export async function recordAvailabilityLocation(userId:string,lat:unknown,lng:unknown,metadata:GpsMetadata={}) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "DriverPartner" WHERE "userId"=${userId} FOR UPDATE`;
    const rider=await tx.driverPartner.findUnique({where:{userId}});
    if(!rider||rider.approvalStatus!=='APPROVED'||!['ONLINE','IN_TRANSIT'].includes(rider.dutyStatus))throw error('RIDER_OFFLINE','Go on duty before sharing your availability.');
    const previous=rider.availabilityLat!=null&&rider.availabilityLng!=null?{lat:rider.availabilityLat,lng:rider.availabilityLng,accuracyMeters:rider.availabilityAccuracyMeters,measuredAt:rider.availabilityMeasuredAt}:null;
    const fix=validateGpsFix(lat,lng,metadata,previous);
    await tx.driverPartner.update({where:{id:rider.id},data:{availabilityLat:fix.lat,availabilityLng:fix.lng,availabilityAccuracyMeters:fix.accuracyMeters,availabilityMeasuredAt:fix.measuredAt,availabilityAt:new Date()}});
  });
}
export async function approvedGpsException(db:Db,orderId:string,scope:'PICKUP'|'DROPOFF',now=new Date()) {
  const exception=await db.gpsException.findFirst({where:{orderId,scope,state:'APPROVED',expiresAt:{gt:now},approvedAt:{lte:now}},orderBy:{createdAt:'desc'}});
  if(!exception?.approvedById||exception.requestedById===exception.approvedById)return false;
  // Approval cannot survive suspension/deletion of either approving operator.
  const admins=await db.user.findMany({where:{id:{in:[exception.approvedById,exception.requestedById]},role:'ADMIN',deletedAt:null},select:{clerkUserId:true}});
  if(admins.length!==2)return false;
  return !(await db.clerkIdentityState.count({where:{clerkUserId:{in:admins.flatMap(a=>a.clerkUserId?[a.clerkUserId]:[])},OR:[{suspended:true},{deleted:true},{deleteRequested:true}]}}));
}
