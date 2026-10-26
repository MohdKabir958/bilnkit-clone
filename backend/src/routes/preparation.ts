import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { requireApprovedPartner } from './partners';
import { validParams, fail } from '../utils/http';
import { AppError } from '../utils/appError';
import { text } from '../services/geography';
import { preparationMinutes } from '../services/preparation';
import { ensureDispatchOffer } from '../services/dispatch';
import { fulfillmentAuthorized } from '../services/marketplace';

export const preparationRouter=Router();
const wrap=(fn:(r:AuthenticatedRequest,s:any)=>Promise<any>)=>async(r:AuthenticatedRequest,s:any)=>{try{await fn(r,s);}catch(e){fail(s,e,'preparation');}};
const vendor=[requireAuth,requireRole('VENDOR'),requireApprovedPartner];
const admin=[requireAuth,requireRole('ADMIN')];
preparationRouter.get('/v1/partner/stores/:id/preparation',...vendor,validParams('id'),wrap(async(r,s)=>{
  const v=await prisma.vendor.findFirst({where:{id:r.params.id,userId:r.user!.id,approvalStatus:'APPROVED'},select:{id:true,preparationMinutes:true,maxPreparingOrders:true,busyUntil:true,isAcceptingOrders:true,operatingHours:true}});
  if(!v)throw new AppError(404,'NOT_FOUND','Store not found.');s.json({success:true,data:v});
}));
preparationRouter.put('/v1/partner/stores/:id/preparation',...vendor,validParams('id'),wrap(async(r,s)=>{
  const b=r.body??{},minutes=preparationMinutes(b.preparationMinutes);
  if(!Number.isInteger(b.maxPreparingOrders)||b.maxPreparingOrders<1||b.maxPreparingOrders>100)throw new AppError(400,'BAD_CAPACITY','Choose 1–100 simultaneous packing orders.');
  const busy=b.busyForMinutes??0;
  if(!Number.isInteger(busy)||busy<0||busy>120)throw new AppError(400,'BAD_BUSY_WINDOW','Pause new orders for 0–120 minutes.');
  const updated=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Vendor" WHERE "id"=${r.params.id} FOR UPDATE`;
    const v=await tx.vendor.findFirst({where:{id:r.params.id,userId:r.user!.id,approvalStatus:'APPROVED'}});if(!v)throw new AppError(404,'NOT_FOUND','Store not found.');
    const result=await tx.vendor.update({where:{id:v.id},data:{preparationMinutes:minutes,maxPreparingOrders:b.maxPreparingOrders,busyUntil:busy?new Date(Date.now()+busy*60000):null},select:{id:true,preparationMinutes:true,maxPreparingOrders:true,busyUntil:true}});
    await tx.adminAuditLog.create({data:{action:'STORE_PREPARATION_POLICY',targetType:'VENDOR',targetId:v.id,summary:`Owner ${r.user!.id} set packing ${minutes} minutes; capacity ${b.maxPreparingOrders}; busy for ${busy} minutes.`}});return result;
  });s.json({success:true,data:updated});
}));
preparationRouter.post('/v1/admin/orders/:id/dispatch/start-early',...admin,validParams('id'),wrap(async(r,s)=>{
  const reason=text(r.body?.reason,'reason',300),evidence=text(r.body?.evidenceReference,'evidenceReference',200);
  if(reason.length<15||evidence.length<10)throw new AppError(400,'EVIDENCE_REQUIRED','Explain the operational reason and independent verification evidence.');
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${r.params.id} FOR UPDATE`;
    const o=await tx.order.findUnique({where:{id:r.params.id}});
    if(!o||o.workflowVersion!==2||o.driverId||!fulfillmentAuthorized(o)||!['ACCEPTED','PREPARING','READY_FOR_PICKUP'].includes(o.status))throw new AppError(409,'NOT_DISPATCHABLE','Only an authorized unassigned preparing order can be matched early.');
    await tx.order.update({where:{id:o.id},data:{dispatchOverrideUntil:new Date(Date.now()+5*60000),dispatchNextAttemptAt:null,dispatchEscalatedAt:null,dispatchNote:null,dispatchRound:(Math.floor(o.dispatchRound/3)+1)*3}});
    await tx.adminAuditLog.create({data:{action:'DISPATCH_TIMING_OVERRIDE',targetType:'ORDER',targetId:o.id,summary:`Operator ${r.user!.id}; reason ${reason}; evidence ${evidence}. Five-minute early matching window.`}});
  });await ensureDispatchOffer(r.params.id);s.json({success:true});
}));
preparationRouter.post('/v1/admin/orders/:id/gps-exceptions',...admin,validParams('id'),wrap(async(r,s)=>{
  const reason=text(r.body?.reason,'reason',300),evidenceReference=text(r.body?.evidenceReference,'evidenceReference',200),scope=r.body?.scope;
  if(!['PICKUP','DROPOFF'].includes(scope)||reason.length<20||evidenceReference.length<10)throw new AppError(400,'EVIDENCE_REQUIRED','Choose pickup or doorstep and provide a detailed reason plus independent verification evidence.');
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${r.params.id} FOR UPDATE`;
    const o=await tx.order.findUnique({where:{id:r.params.id}});
    if(!o||!o.driverId||!['ACCEPTED','PREPARING','READY_FOR_PICKUP','PICKED_UP','ARRIVED_AT_GATE'].includes(o.status))throw new AppError(409,'ORDER_NOT_ACTIVE','GPS review requires an active assigned delivery.');
    const exception=await tx.gpsException.create({data:{orderId:o.id,scope,reason,evidenceReference,requestedById:r.user!.id,expiresAt:new Date(Date.now()+15*60000)}});
    await tx.adminAuditLog.create({data:{action:'GPS_EXCEPTION_REQUESTED',targetType:'ORDER',targetId:o.id,summary:`Operator ${r.user!.id} requested ${scope} GPS review ${exception.id}; reason ${reason}; evidence ${evidenceReference}. Independent approval is required; delivery code remains mandatory.`}});return exception;
  });s.status(201).json({success:true,data:result});
}));
preparationRouter.post('/v1/admin/gps-exceptions/:id/approve',...admin,validParams('id'),wrap(async(r,s)=>{
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "GpsException" WHERE "id"=${r.params.id} FOR UPDATE`;
    const exception=await tx.gpsException.findUnique({where:{id:r.params.id}});
    if(!exception)throw new AppError(404,'NOT_FOUND','GPS review not found.');
    if(exception.requestedById===r.user!.id)throw new AppError(403,'INDEPENDENT_APPROVAL_REQUIRED','A different administrator must verify the evidence and approve this exception.');
    if(exception.expiresAt<=new Date())throw new AppError(409,'GPS_REVIEW_EXPIRED','Request a new GPS review; this one expired.');
    if(exception.state==='APPROVED')return exception;
    const result=await tx.gpsException.update({where:{id:exception.id},data:{state:'APPROVED',approvedById:r.user!.id,approvedAt:new Date()}});
    await tx.adminAuditLog.create({data:{action:'GPS_EXCEPTION_APPROVED',targetType:'ORDER',targetId:exception.orderId,summary:`Independent operator ${r.user!.id} verified evidence ${exception.evidenceReference}; approved ${exception.scope} until ${exception.expiresAt.toISOString()}. Delivery OTP/cash checks unchanged.`}});return result;
  });s.json({success:true,data:result});
}));

import { getSlaPolicy, validateSlaPolicy } from '../services/operationalSla';
import { vendorAcceptWindowMin } from '../config/orderFlow';
preparationRouter.get('/v1/admin/operations/sla-policy',...admin,wrap(async(_r,s)=>s.json({success:true,data:{thresholds:await getSlaPolicy(),vendorAcceptWindowMinutes:vendorAcceptWindowMin(),acceptanceTimeoutConfiguredAt:'VENDOR_ACCEPT_WINDOW_MIN server environment'}})));
preparationRouter.put('/v1/admin/operations/sla-policy',...admin,wrap(async(r,s)=>{
  const value=validateSlaPolicy(r.body?.thresholds),reason=text(r.body?.reason,'reason',200);
  if(reason.length<10)throw new AppError(400,'REASON_REQUIRED','Explain the operational reason for changing these thresholds.');
  await prisma.$transaction(async tx=>{
    await tx.appSetting.upsert({where:{key:'operational_sla'},create:{key:'operational_sla',value,updatedBy:r.user!.id},update:{value,updatedBy:r.user!.id}});
    await tx.adminAuditLog.create({data:{action:'OPERATIONAL_SLA_POLICY',targetType:'SETTING',targetId:'operational_sla',summary:`Operator ${r.user!.id}: ${reason}; thresholds ${JSON.stringify(value)}`}});
  });s.json({success:true,data:value});
}));
