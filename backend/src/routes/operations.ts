import {marketplaceOverview} from '../services/overview';
import { fulfillmentWhere, fulfillmentAuthorized, requireRiderAt } from '../services/marketplace';
import { checkVendorProfileText, checkVendorBanner } from '../services/vendorProfile';
import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { requireApprovedPartner } from './partners';
import { validParams, fail, ID_RE } from '../utils/http';
import { AppError } from '../utils/appError';
import { text } from '../services/geography';
import { declineDispatchOffer, ensureDispatchOffer } from '../services/dispatch';
import { drainNotificationIntents } from '../services/push/intents';
import { withOrderLock } from '../services/orderFlow';
import { ACTIVE_RIDER_STATUSES } from '../services/orderView';
import { createSupportCase, replyToSupportCase, requesterSupportCase, publicSupportNote, updateSupportCase } from '../services/supportCases';

export const operationsRouter=Router();
const wrap=(fn:(r:AuthenticatedRequest,s:Response)=>Promise<any>)=>async(r:AuthenticatedRequest,s:Response)=>{try{await fn(r,s);}catch(e){fail(s,e,'operations');}};
const ok=(s:Response,data:unknown,status=200)=>s.status(status).json({success:true,data});
const admin=[requireAuth,requireRole('ADMIN')] as const;
const requester=[requireAuth,requireRole('STUDENT','VENDOR','DRIVER')] as const;
const messageText=(v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))throw new AppError(400,'BAD_REQUEST','Enter a message of 1–2000 characters.');return v.trim();};
const page=(r:AuthenticatedRequest)=>{const take=r.query.limit===undefined?50:Number(r.query.limit),after=r.query.after;if(!Number.isInteger(take)||take<1||take>100||after!==undefined&&(typeof after!=='string'||!ID_RE.test(after)))throw new AppError(400,'BAD_REQUEST','Invalid pagination.');return{take,...(after?{cursor:{id:after as string},skip:1}:{})};};
operationsRouter.put('/v1/admin/drivers/:id/service-area',...admin,validParams('id'),wrap(async(r,s)=>{
  const zoneId=text(r.body?.zoneId,'zoneId',64);
  const data=await prisma.$transaction(async(tx)=>{
    await tx.$queryRaw`SELECT "id" FROM "DriverPartner" WHERE "id"=${r.params.id} FOR UPDATE`;
    const d=await tx.driverPartner.findUnique({where:{id:r.params.id}}),z=await tx.deliveryZone.findUnique({where:{id:zoneId},include:{city:true}});
    if(!d?.userId||!z||!z.active||!z.city.active) throw new AppError(400,'BAD_SERVICE_AREA','Choose a linked rider and an enabled delivery zone.');
    if(await tx.order.count({where:{driverId:d.userId,status:{in:[...ACTIVE_RIDER_STATUSES]}}}))throw new AppError(409,'RIDER_BUSY','Finish or reassign this rider’s deliveries before changing their service area.');
    await tx.dispatchOffer.updateMany({where:{driverId:d.id,state:'PENDING'},data:{state:'REVOKED',reason:'Service area changed'}});
    const row=await tx.driverPartner.update({where:{id:d.id},data:{cityId:z.cityId,serviceZoneId:z.id}});
    await tx.adminAuditLog.create({data:{action:'RIDER_SERVICE_AREA_CHANGED',targetType:'DRIVER',targetId:d.id,summary:`Admin ${r.user!.id} assigned zone ${z.id}`}});return row;
  });ok(s,data);
}));
operationsRouter.post('/v1/dispatch-offers/:id/decline',requireAuth,requireRole('DRIVER'),requireApprovedPartner,validParams('id'),wrap(async(r,s)=>{await declineDispatchOffer(r.params.id,r.user!.id,text(r.body?.reason??'Not available','reason',160));ok(s,{declined:true});}));
operationsRouter.post('/v1/admin/orders/:id/dispatch/retry',...admin,validParams('id'),wrap(async(r,s)=>{
  const id=await withOrderLock(r.params.id,async(tx,o,g)=>{
    const primary=g?.[0]??o;if(primary.driverId||!['ACCEPTED','PREPARING','READY_FOR_PICKUP'].includes(primary.status)||!fulfillmentAuthorized(primary))throw new AppError(409,'ORDER_NOT_AVAILABLE','Only an eligible unassigned delivery can be offered again.');
    await tx.dispatchOffer.updateMany({where:{orderId:primary.id,state:'PENDING'},data:{state:'REVOKED',reason:'Admin retry'}});
    await tx.order.update({where:{id:primary.id},data:{dispatchRound:primary.workflowVersion===2?(Math.floor(primary.dispatchRound/3)+1)*3:{increment:1},dispatchNote:null,dispatchEscalatedAt:null,dispatchNextAttemptAt:null}});
    await tx.adminAuditLog.create({data:{action:'DISPATCH_RETRIED',targetType:'ORDER',targetId:primary.id,summary:`Admin ${r.user!.id} requested a new offer round`}});return primary.id;
  });await ensureDispatchOffer(id);ok(s,{retried:true});
}));
operationsRouter.post('/v1/orders/:id/arrive-pickup',requireAuth,requireRole('DRIVER'),requireApprovedPartner,validParams('id'),wrap(async(r,s)=>{
  await withOrderLock(r.params.id,async(tx,o)=>{
    if(o.driverId!==r.user!.id)throw new AppError(404,'NOT_FOUND','Delivery not found.');
    if(!['ACCEPTED','PREPARING','READY_FOR_PICKUP'].includes(o.status))throw new AppError(409,'BAD_STATE','Pickup arrival can be confirmed before collection.');
    if(o.pickupArrivalAt)return;
    await requireRiderAt(tx,o,o.vendor);
    await tx.order.update({where:{id:o.id},data:{pickupArrivalAt:new Date(),riderArrivedPickupAt:new Date()}});
    await tx.notificationIntent.create({data:{orderId:o.id,event:'RIDER_AT_PICKUP',options:{bucket:o.updatedAt.getTime()}}});
    await tx.adminAuditLog.create({data:{action:'RIDER_AT_PICKUP',targetType:'ORDER',targetId:o.id,summary:`Assigned rider ${r.user!.id} confirmed arrival at the store`}});
  });drainNotificationIntents();ok(s,{arrived:true});
}));
operationsRouter.get('/v1/admin/dispatch',...admin,wrap(async(r,s)=>{
  const cityId=r.query.cityId===undefined?undefined:text(r.query.cityId,'cityId',64),p=page(r);
  const rows=await prisma.order.findMany({...p,where:{AND:[fulfillmentWhere],status:{in:['ACCEPTED','PREPARING','READY_FOR_PICKUP']},driverId:null,OR:[{groupId:null},{groupIndex:0}],...(cityId?{vendor:{cityId}}:{})},orderBy:{id:'asc'},select:{id:true,status:true,createdAt:true,dispatchRound:true,dispatchNote:true,dispatchEscalatedAt:true,dispatchNextAttemptAt:true,vendor:{select:{id:true,name:true,cityId:true}},dispatchOffers:{orderBy:{createdAt:'desc'},take:10,select:{id:true,state:true,round:true,expiresAt:true,reason:true,driver:{select:{id:true,name:true}}}}}});
  s.json({success:true,data:rows,nextCursor:rows.length===p.take?rows.at(-1)!.id:null});
}));

const storeFields={id:true,name:true,address:true,bannerImage:true,pinCode:true,locality:true,city:{select:{name:true,state:true}},coverage:{select:{active:true}}} as const;
operationsRouter.get('/v1/partner/store',requireAuth,requireRole('VENDOR'),requireApprovedPartner,wrap(async(r,s)=>{
  const store=await prisma.vendor.findFirst({where:{userId:r.user!.id,approvalStatus:'APPROVED',...(r.query.vendorId?{id:text(r.query.vendorId,'vendorId',64)}:{})},select:storeFields});
  if(!store)throw new AppError(404,'NOT_FOUND','Store not found.');ok(s,store);
}));
operationsRouter.put('/v1/partner/store',requireAuth,requireRole('VENDOR'),requireApprovedPartner,wrap(async(r,s)=>{
  const b=r.body??{},keys=Object.keys(b),allowed=['name','address','bannerImage'];
  if(!keys.length||keys.some(k=>!allowed.includes(k)))throw new AppError(400,'BAD_REQUEST','Only store name, pickup address and banner image can be edited here.');
  const data:Prisma.VendorUpdateInput={};
  if(b.name!==undefined)data.name=checkVendorProfileText(b.name,'name','Store name',2,60);
  if(b.address!==undefined)data.address=checkVendorProfileText(b.address,'address','Pickup address',3,140);
  if(b.bannerImage!==undefined){const image=checkVendorBanner(b.bannerImage);if(image){const url=new URL(image);if(url.protocol!=='https:'||url.username||url.password)throw new AppError(400,'BAD_REQUEST','Use an HTTPS banner URL without credentials.','bannerImage');}data.bannerImage=image;}
  const result=await prisma.$transaction(async(tx)=>{
    const account=await tx.$queryRaw<{deletedAt:Date|null}[]>`SELECT "deletedAt" FROM "User" WHERE "id"=${r.user!.id} FOR SHARE`;
    if(!account.length||account[0].deletedAt)throw new AppError(401,'ACCOUNT_UNAVAILABLE','Please sign in again.');
    const selected=r.query.vendorId?text(r.query.vendorId,'vendorId',64):'';
    const ids=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "Vendor" WHERE "userId"=${r.user!.id} AND "approvalStatus"='APPROVED' AND (${selected}='' OR "id"=${selected}) ORDER BY "id" FOR UPDATE`;
    if(!ids.length)throw new AppError(404,'NOT_FOUND','Store not found.');
    const before=await tx.vendor.findUniqueOrThrow({where:{id:ids[0].id}});
    const changed=keys.some(k=>(data as any)[k] !== (before as any)[k]);
    if(data.name!==undefined&&data.name!==before.name){
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vendor-name-unique'))`;
      const taken=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "Vendor" WHERE "id"<>${before.id} AND "approvalStatus"='APPROVED' AND lower(regexp_replace(btrim("name"), '\\s+', ' ', 'g'))=lower(${data.name as string}) LIMIT 1`;
      if(taken.length)throw new AppError(409,'NAME_TAKEN','Another store already uses this name.','name');
    }
    const coverageNeedsReview=data.address!==undefined&&data.address!==before.address;
    if(changed){
      await tx.vendor.update({where:{id:before.id},data});
      if(coverageNeedsReview)await tx.vendorCoverage.updateMany({where:{vendorId:before.id},data:{active:false}});
      await tx.adminAuditLog.create({data:{action:'STORE_PROFILE_UPDATED',targetType:'VENDOR',targetId:before.id,summary:`Store owner ${r.user!.id} updated ${keys.join(', ')}${coverageNeedsReview?'; coverage disabled pending location review':''}`}});
    }
    return {changed,coverageNeedsReview,store:await tx.vendor.findUniqueOrThrow({where:{id:before.id},select:storeFields})};
  });s.json({success:true,data:result.store,changed:result.changed,coverageNeedsReview:result.coverageNeedsReview});
}));

operationsRouter.post('/v1/support-cases',...requester,wrap(async(r,s)=>{
  ok(s,await createSupportCase(r.user!,r.body),201);
}));
operationsRouter.get('/v1/support-cases',...requester,wrap(async(r,s)=>{
  const p=page(r),rows=await prisma.supportCase.findMany({...p,where:{customerId:r.user!.id},orderBy:[{createdAt:'desc'},{id:'desc'}],include:{notes:{where:{internal:false},orderBy:{createdAt:'desc'},take:20},evidence:{where:{expiresAt:{gt:new Date()}},orderBy:{createdAt:'asc'}}}});
  s.json({success:true,data:rows.map(requesterSupportCase),nextCursor:rows.length===p.take?rows.at(-1)!.id:null});
}));
operationsRouter.get('/v1/support-cases/:id',...requester,validParams('id'),wrap(async(r,s)=>{
  const c=await prisma.supportCase.findFirst({where:{id:r.params.id,customerId:r.user!.id},include:{evidence:{where:{expiresAt:{gt:new Date()}},orderBy:{createdAt:'asc'}}}});if(!c)throw new AppError(404,'NOT_FOUND','Request not found.');
  const p=page(r),notes=await prisma.supportNote.findMany({...p,where:{caseId:c.id,internal:false},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  ok(s,{...requesterSupportCase(c),notes:notes.map(n=>publicSupportNote(n,c.customerId)),nextNotesCursor:notes.length===p.take?notes.at(-1)!.id:null});
}));
operationsRouter.post('/v1/support-cases/:id/replies',...requester,validParams('id'),wrap(async(r,s)=>{
  await replyToSupportCase(r.user!,r.params.id,r.body?.message);ok(s,{sent:true});
}));
operationsRouter.get('/v1/admin/support-cases',...admin,wrap(async(r,s)=>{
  const p=page(r),status=r.query.status===undefined?undefined:text(r.query.status,'status',20);
  if(status&&!['OPEN','IN_PROGRESS','RESOLVED'].includes(status))throw new AppError(400,'BAD_REQUEST','Invalid support status.');
  const rows=await prisma.supportCase.findMany({...p,where:{...(status?{status}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],include:{notes:{orderBy:{createdAt:'desc'},take:100},evidence:{where:{expiresAt:{gt:new Date()}},select:{id:true,mime:true,bytes:true,caption:true,createdAt:true,expiresAt:true}},customer:{select:{id:true,name:true}},order:{select:{id:true,status:true,paymentStatus:true,refundStatus:true}}}});
  s.json({success:true,data:rows,nextCursor:rows.length===p.take?rows.at(-1)!.id:null});
}));
operationsRouter.post('/v1/admin/support-cases/:id/notes',...admin,validParams('id'),wrap(async(r,s)=>{
  ok(s,await updateSupportCase(r.user!,r.params.id,r.body));
}));
operationsRouter.get('/v1/admin/audit',...admin,wrap(async(r,s)=>{
  const p=page(r),rows=await prisma.adminAuditLog.findMany({...p,orderBy:[{createdAt:'desc'},{id:'desc'}]});s.json({success:true,data:rows,nextCursor:rows.length===p.take?rows.at(-1)!.id:null});
}));
operationsRouter.get('/v1/admin/operations',...admin,wrap(async(r,s)=>{
  const cityId=r.query.cityId===undefined?undefined:text(r.query.cityId,'cityId',64);
  const days=r.query.days===undefined?7:Number(r.query.days);if(!Number.isInteger(days)||days<1||days>90)throw new AppError(400,'BAD_REQUEST','Choose 1–90 days.');
  const from=new Date(Date.now()-days*86400000),city=cityId?Prisma.sql`AND v."cityId"=${cityId}`:Prisma.empty;
  const [metrics]=await prisma.$queryRaw<any[]>(Prisma.sql`SELECT COUNT(DISTINCT COALESCE(o."groupId",o."id"))::int AS "orders",COUNT(*)::int AS "storeOrders",COUNT(DISTINCT COALESCE(o."groupId",o."id")) FILTER(WHERE o.status NOT IN ('DELIVERED','CANCELLED'))::int AS "active",COUNT(DISTINCT COALESCE(o."groupId",o."id")) FILTER(WHERE o.status='DELIVERED')::int AS "delivered",COUNT(DISTINCT COALESCE(o."groupId",o."id")) FILTER(WHERE o.status='CANCELLED')::int AS "cancelled",COUNT(DISTINCT o."customerId")::int AS "customers",COALESCE(SUM(ROUND((o."totalAmount"*100)::numeric)) FILTER(WHERE o."paymentStatus" IN ('PAID','REFUNDED')),0)::bigint AS "grossPaise",COALESCE(SUM(ROUND((o."totalAmount"*100)::numeric)) FILTER(WHERE o."paymentStatus"='REFUNDED'),0)::bigint AS "refundPaise",COALESCE(SUM(ROUND((o."commissionTotal"*100)::numeric)) FILTER(WHERE o.status='DELIVERED' AND o."paymentStatus"='PAID'),0)::bigint AS "commissionPaise" FROM "Order" o JOIN "Vendor" v ON v.id=o."vendorId" WHERE o."createdAt">=${from} ${city}`);
  for(const key of ['grossPaise','refundPaise','commissionPaise']) {metrics[key]=Number(metrics[key]);if(!Number.isSafeInteger(metrics[key]))throw new AppError(503,'REPORT_TOO_LARGE','Narrow the report range.');}
  const [stores,riders,products,openCases]=await Promise.all([prisma.vendor.count({where:{approvalStatus:'APPROVED',...(cityId?{cityId}:{})}}),prisma.driverPartner.count({where:{approvalStatus:'APPROVED',dutyStatus:{in:['ONLINE','IN_TRANSIT']},...(cityId?{cityId}:{})}}),prisma.menuItem.count({where:{approvalStatus:'APPROVED',deletedAt:null,isAvailable:true,stockQty:{gt:0},...(cityId?{vendor:{cityId}}:{})}}),prisma.supportCase.count({where:{status:{not:'RESOLVED'},...(cityId?{order:{vendor:{cityId}}}:{})}})]);
  ok(s,{from:from.toISOString(),days,cityId:cityId??null,...metrics,activeStores:stores,onlineRiders:riders,availableProducts:products,openSupportCases:openCases});
}));

operationsRouter.get('/v1/admin/dashboard',...admin,wrap(async(r,s)=>{const cityId=r.query.cityId===undefined?undefined:text(r.query.cityId,'cityId',64);ok(s,await marketplaceOverview(cityId,r.query.days));}));
