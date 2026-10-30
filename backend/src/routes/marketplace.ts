import { assessFulfillmentCapacity } from '../services/capacity';
import { ownedAddress } from '../services/geography';
import { recordAvailabilityLocation } from '../services/gps';
import { appendLegacyCashEvent } from '../services/cashReconciliation';
import { paymentCapabilities } from '../services/paymentCapabilities';
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { requireApprovedPartner } from './partners';
import { fail, validParams } from '../utils/http';
import { AppError } from '../utils/appError';
import { indianPoint, text } from '../services/geography';
import { requireMarketplaceStore } from '../services/marketplace';
import { quoteOrder } from '../services/orderGroups';
import { placeOrder } from '../services/orderFlow';
import { orderView } from '../services/orderView';

export const marketplaceRouter = Router();
const wrap=(fn:(r:AuthenticatedRequest,s:any)=>Promise<any>)=>async(r:AuthenticatedRequest,s:any)=>{try{await fn(r,s);}catch(e){fail(s,e,'marketplace');}};
const customer=[requireAuth,requireRole('STUDENT')];
const admin=[requireAuth,requireRole('ADMIN')];
const input=(b:any)=>{
  const vendorId=text(b.vendorId,'vendorId',64),addressId=text(b.addressId,'addressId',64);
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>100||b.items.some((i:any)=>!i||typeof i.itemId!=='string'||i.itemId.length>64||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100)) throw new AppError(400,'INVALID_ITEMS','Choose valid products and quantities.');
  if(b.restaurants||b.vendorIds) throw new AppError(400,'ONE_STORE_ONLY','Place a separate order for each store.');
  const paymentMethod=b.paymentMethod??'ONLINE';
  if(!['ONLINE','COD'].includes(paymentMethod)) throw new AppError(400,'INVALID_PAYMENT_METHOD','Choose online payment or cash on delivery.');
  return {vendorId,addressId,items:b.items as {itemId:string;quantity:number}[],paymentMethod:paymentMethod as 'ONLINE'|'COD',couponCode:b.couponCode?text(b.couponCode,'couponCode',30):undefined};
};
marketplaceRouter.post('/v2/checkout/quote',...customer,wrap(async(r,s)=>{
  const b=input(r.body??{}),store=await requireMarketplaceStore(prisma,b.vendorId);
  const quote=await quoteOrder(r.user!.id,{restaurants:[{vendorId:b.vendorId,items:b.items}],addressId:b.addressId,couponCode:b.couponCode});
  const address=await ownedAddress(prisma,r.user!.id,b.addressId);
  const capacity=await assessFulfillmentCapacity(prisma,b.vendorId,address);
  const capabilities=paymentCapabilities(!!store.city?.codEnabled);
  const methods=capacity.canCheckout?capabilities.paymentMethods.filter(m=>m!=='ONLINE'||capacity.onlineAllowed):[];
  s.json({success:true,data:{...quote,maxRestaurants:1,capacity,paymentMethods:methods,paymentCapabilities:capabilities}});
}));
marketplaceRouter.post('/v2/checkout',...customer,wrap(async(r,s)=>{
  const b=input(r.body??{}),clientRequestId=text(r.body?.clientRequestId,'clientRequestId',64);
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(clientRequestId)) throw new AppError(400,'BAD_REQUEST','Use a unique checkout request identifier.');
  const result=await placeOrder(r.user!.id,{...b,workflowVersion:2,clientRequestId,dropoffHostel:'',dropoffNotes:text(r.body?.dropoffNotes,'delivery notes',300,false)||null});
  s.status(result.replay?200:201).json({success:true,idempotentReplay:result.replay,data:orderView(result.order,'STUDENT',r.user!.id)});
}));

// First-party on-duty GPS only; a separate ephemeral availability point is never exposed to customers.
marketplaceRouter.post('/v1/drivers/availability-location',requireAuth,requireRole('DRIVER'),requireApprovedPartner,wrap(async(r,s)=>{
  await recordAvailabilityLocation(r.user!.id,r.body?.lat,r.body?.lng,r.body??{});
  s.json({success:true});
}));
marketplaceRouter.get('/v1/partner/stores',requireAuth,requireRole('VENDOR'),requireApprovedPartner,wrap(async(r,s)=>{
  const rows=await prisma.vendor.findMany({where:{userId:r.user!.id,approvalStatus:'APPROVED'},select:{id:true,name:true,address:true,isAcceptingOrders:true,primaryCategoryId:true,publicPhone:true},orderBy:{name:'asc'}});
  s.json({success:true,data:rows});
}));

marketplaceRouter.get('/v1/partner/stores/:id',requireAuth,requireRole('VENDOR'),requireApprovedPartner,validParams('id'),wrap(async(r,s)=>{
 const v=await prisma.vendor.findFirst({where:{id:r.params.id,userId:r.user!.id,approvalStatus:'APPROVED'}});
 if(!v)throw new AppError(404,'NOT_FOUND','Store not found.');
 const user=await prisma.user.findUniqueOrThrow({where:{id:r.user!.id},select:{id:true,name:true,phone:true,role:true,avatarId:true}});
 s.json({success:true,user,approvalStatus:v.approvalStatus,vendor:{...v,hasLocation:!!v.locationSource}});
}));

marketplaceRouter.put('/v1/partner/stores/:id/location',requireAuth,requireRole('VENDOR'),requireApprovedPartner,validParams('id'),wrap(async(r,s)=>{
 if(!indianPoint(r.body?.lat,r.body?.lng))throw new AppError(400,'BAD_LOCATION','Choose a valid store pickup location in India.');
 const result=await prisma.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "Vendor" WHERE "id"=${r.params.id} AND "userId"=${r.user!.id} AND "approvalStatus"='APPROVED' FOR UPDATE`;
  if(!rows.length)throw new AppError(404,'NOT_FOUND','Store not found.');
  const v=await tx.vendor.update({where:{id:rows[0].id},data:{lat:r.body.lat,lng:r.body.lng,locationSource:'DEVICE',locationSetAt:new Date()}});
  await tx.vendorCoverage.updateMany({where:{vendorId:v.id},data:{active:false}});
  await tx.adminAuditLog.create({data:{action:'VENDOR_LOCATION_SET',targetType:'VENDOR',targetId:v.id,summary:'Approved owner updated selected pickup pin; coverage paused for operator review.'}});
  return {...v,hasLocation:true};
 });s.json({success:true,data:result,coverageNeedsReview:true});
}));

marketplaceRouter.get('/v1/admin/cash',...admin,wrap(async(r,s)=>{
  const after=typeof r.query.after==='string'?r.query.after:undefined;
  const rows=await prisma.cashCollection.findMany({where:r.query.cityId?{order:{vendor:{cityId:text(r.query.cityId,'cityId',64)}}}:{},take:51,...(after?{cursor:{id:after},skip:1}:{}),orderBy:{id:'asc'},include:{order:{select:{id:true,status:true,vendor:{select:{name:true,cityId:true}}}}}});
  s.json({success:true,data:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null});
}));
// These endpoints RECORD a verified physical handover/refund; they never transfer funds.
for(const action of ['remit','refund'] as const) marketplaceRouter.post(`/v1/admin/cash/:id/${action}`,...admin,validParams('id'),wrap(async(r,s)=>{
  const reference=text(r.body?.reference,'reference',120);
  if(reference.length<5) throw new AppError(400,'REFERENCE_REQUIRED','Enter a traceable receipt or refund reference.');
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "CashCollection" WHERE "id"=${r.params.id} FOR UPDATE`;
    const cash=await tx.cashCollection.findUnique({where:{id:r.params.id}});
    if(!cash) throw new AppError(404,'NOT_FOUND','Cash entry not found.');
    const previous=action==='remit'?cash.remittanceReference:cash.refundReference;
    if(previous) {if(previous!==reference) throw new AppError(409,'ALREADY_RECORDED','This cash event is already recorded with a different reference.');return cash;}
    if(action==='refund'&&!cash.remittedAt) throw new AppError(409,'CASH_NOT_REMITTED','Record cash handover before recording a platform-funded cash refund.');
    await appendLegacyCashEvent(tx,cash,action,r.user!.id,reference);
    const updated=await tx.cashCollection.update({where:{id:cash.id},data:action==='remit'?{remittedAt:new Date(),remittedById:r.user!.id,remittanceReference:reference}:{refundedAt:new Date(),refundedById:r.user!.id,refundReference:reference}});
    if(action==='refund') await tx.order.update({where:{id:cash.orderId},data:{paymentStatus:'REFUNDED',refundStatus:'MANUAL_CASH_REFUND'}});
    await tx.adminAuditLog.create({data:{action:action==='remit'?'CASH_REMITTED':'CASH_REFUND_RECORDED',targetType:'ORDER',targetId:cash.orderId,summary:`Operator ${r.user!.id} recorded full cash ${action}; receipt ${reference}. No gateway transfer was performed.`}});
    return updated;
  });
  s.json({success:true,data:result});
}));
