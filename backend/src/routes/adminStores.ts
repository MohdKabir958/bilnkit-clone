import {invalidatePublicCategories} from '../services/categories';
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { usesClerk } from '../config/authMode';
import { indianPoint, kmBetween, text } from '../services/geography';
import { normalizeAdminEmail } from '../services/adminAccess';
import {eligibleRiderAccount} from '../services/riderOnboarding';
import { verifiedPartnerIdentity } from '../services/clerkIdentity';
import { AppError } from '../utils/appError';
import { fail } from '../utils/http';
import { canonicalPhone } from '../utils/phone';
import { NAME_RE } from '../utils/names';
import { validateDriverFields, newRunnerCode } from './partners';

export const adminStoresRouter = Router();
adminStoresRouter.post('/v1/admin/stores',requireAuth,requireRole('ADMIN'),async(req:AuthenticatedRequest,res)=>{
  try {
    const b = req.body ?? {}, name = text(b.name,'name',60), address = text(b.address,'address',140), cityId = text(b.cityId,'cityId',64);
    const pinCode = text(b.pinCode,'pinCode',6), locality = text(b.locality,'locality',100);
    if (!/^[1-9]\d{5}$/.test(pinCode) || !indianPoint(b.lat,b.lng)) throw new AppError(400,'BAD_LOCATION','Enter a six-digit PIN and a confirmed location in India.');
    const city = await prisma.city.findUnique({where:{id:cityId}});
    if (!city?.active) throw new AppError(400,'CITY_REQUIRED','Choose an enabled city.','cityId');
    let category=b.primaryCategoryId?await prisma.category.findUnique({where:{id:text(b.primaryCategoryId,'primaryCategoryId',64)}}):null;
    if(b.primaryCategoryId&&(!category?.isActive||!category.forRestaurants)) throw new AppError(400,'CATEGORY_REQUIRED','Choose an active store category.');
    const publicPhone=text(b.publicPhone,'publicPhone',16,false);
    if(publicPhone&&!/^\+?[0-9 ()-]{10,16}$/.test(publicPhone)) throw new AppError(400,'BAD_PHONE','Enter a public business contact number.');
    let ownerSubject: string | undefined;
    if (b.ownerEmail) {
      if (!usesClerk()) throw new AppError(400,'CLERK_REQUIRED','Email-based owner assignment requires Clerk authentication.');
      ownerSubject = (await verifiedPartnerIdentity(normalizeAdminEmail(b.ownerEmail))).id;
    }
    const row = await prisma.$transaction(async tx => {
      if(b.primaryCategoryId){
        await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${text(b.primaryCategoryId,'primaryCategoryId',64)} FOR SHARE`;
        category=await tx.category.findUnique({where:{id:b.primaryCategoryId}});
        if(!category?.isActive||!category.forRestaurants)throw new AppError(400,'CATEGORY_REQUIRED','Choose an active store category.','primaryCategoryId');
      }
      await tx.$queryRaw`SELECT id FROM "City" WHERE id=${cityId} FOR SHARE`;
      if(!(await tx.city.findUnique({where:{id:cityId}}))?.active)throw new AppError(400,'CITY_REQUIRED','Choose an enabled city.','cityId');
      let ownerId: string | undefined;
      if (ownerSubject) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerSubject}, 81971))`;
        const owner = await tx.user.findUnique({where:{clerkUserId:ownerSubject}});
        const state = await tx.clerkIdentityState.findUnique({where:{clerkUserId:ownerSubject}});
        if (!owner || owner.deletedAt || !['STUDENT','VENDOR'].includes(owner.role) || state?.deleted || state?.suspended || state?.deleteRequested) throw new AppError(409,'OWNER_UNAVAILABLE','The partner must sign in to Grozo first using a separate eligible account.','ownerEmail');
        if (await tx.vendor.count({where:{userId:owner.id,approvalStatus:'SUSPENDED'}})) throw new AppError(409,'PARTNER_SUSPENDED','Review the suspended partner before assigning a store.');
        await tx.user.update({where:{id:owner.id},data:{role:'VENDOR'}});
        ownerId = owner.id;
      }
      if(b.zoneId)await tx.$queryRaw`SELECT id FROM "DeliveryZone" WHERE id=${text(b.zoneId,'zoneId',64)} FOR SHARE`;
      const zone = b.zoneId ? await tx.deliveryZone.findUnique({where:{id:text(b.zoneId,'zoneId',64)}}) : null;
      if (b.zoneId && (!zone?.active || zone.cityId !== cityId || kmBetween({lat:b.lat,lng:b.lng},{lat:zone.centerLat,lng:zone.centerLng}) > zone.radiusKm)) throw new AppError(400,'ZONE_MISMATCH','Choose an enabled zone in this city that contains the store pickup location.','zoneId');
      const store = await tx.vendor.create({data:{name,address,cityId,pinCode,locality,lat:b.lat,lng:b.lng,userId:ownerId,category:category?.name??'Groceries',primaryCategoryId:category?.id,publicPhone:publicPhone||null,description:text(b.description,'description',600,false)||null,bannerImage:'',isAcceptingOrders:false,approvalStatus:'APPROVED',locationSource:'ADMIN',locationSetAt:new Date(),eta:''}});
      if (zone) await tx.vendorCoverage.create({data:{vendorId:store.id,zoneId:zone.id,active:true}});
      await tx.adminAuditLog.create({data:{action:'STORE_CREATED',targetType:'VENDOR',targetId:store.id,summary:`Operator ${req.user!.id} created a closed store with confirmed pickup${ownerId?' and a verified partner owner':''}.`}});
      return store;
    });
    invalidatePublicCategories();
    res.status(201).json({success:true,data:row});
  } catch(e) { fail(res,e,'Store could not be created'); }
});

// Configure an existing draft without copying an identity/login phone into its public contact.
adminStoresRouter.patch('/v1/admin/stores/:id',requireAuth,requireRole('ADMIN'),async(req:AuthenticatedRequest,res)=>{
  try {
    const b=req.body??{};
    let category=b.primaryCategoryId?await prisma.category.findUnique({where:{id:text(b.primaryCategoryId,'primaryCategoryId',64)}}):null;
    if(b.primaryCategoryId&&(!category?.isActive||!category.forRestaurants)) throw new AppError(400,'CATEGORY_REQUIRED','Choose an active store category.');
    const publicPhone=b.publicPhone===undefined?undefined:text(b.publicPhone,'publicPhone',16,false);
    if(publicPhone && !/^\+?[0-9 ()-]{10,16}$/.test(publicPhone)) throw new AppError(400,'BAD_PHONE','Enter a public business contact number.');
    const ownerSubject=b.ownerEmail?(await verifiedPartnerIdentity(normalizeAdminEmail(b.ownerEmail))).id:undefined;
    const row=await prisma.$transaction(async tx=>{
      let userId:string|undefined;
      if(ownerSubject) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerSubject},81971))`;
        const user=await tx.user.findUnique({where:{clerkUserId:ownerSubject}}),state=await tx.clerkIdentityState.findUnique({where:{clerkUserId:ownerSubject}});
        if(!user||user.deletedAt||!['STUDENT','VENDOR'].includes(user.role)||state?.deleted||state?.suspended||state?.deleteRequested||await tx.vendor.count({where:{userId:user.id,approvalStatus:'SUSPENDED'}})) throw new AppError(409,'OWNER_UNAVAILABLE','The owner must have an eligible verified Grozo account.');
        await tx.user.update({where:{id:user.id},data:{role:'VENDOR'}});userId=user.id;
      }
      const store=await tx.vendor.findUnique({where:{id:req.params.id}});
      if(!store) throw new AppError(404,'NOT_FOUND','Store not found.');
      if(userId&&userId!==store.userId&&await tx.order.count({where:{vendorId:store.id,status:{notIn:['DELIVERED','CANCELLED']}}})) throw new AppError(409,'ACTIVE_ORDERS','Finish or cancel active store orders before changing its owner.');
      const updated=await tx.vendor.update({where:{id:store.id},data:{...(category?{primaryCategoryId:category.id,category:category.name}:{}),...(userId?{userId}:{}),...(publicPhone!==undefined?{publicPhone:publicPhone||null}:{}),...(b.description===undefined?{}:{description:text(b.description,'description',600,false)||null})}});
      await tx.adminAuditLog.create({data:{action:'STORE_MARKETPLACE_UPDATED',targetType:'VENDOR',targetId:store.id,summary:`Operator ${req.user!.id} updated category, public contact or verified ownership.`}});
      return updated;
    });invalidatePublicCategories();res.json({success:true,data:row});
  }catch(e){fail(res,e,'Store configuration could not be saved');}
});

// Admin onboarding links an already verified provider identity; it never creates sessions/passwords.
adminStoresRouter.post('/v1/admin/riders',requireAuth,requireRole('ADMIN'),async(req:AuthenticatedRequest,res)=>{
  try {
    if(!usesClerk()) throw new AppError(400,'CLERK_REQUIRED','Rider email onboarding requires Clerk.');
    const b=req.body??{},email=normalizeAdminEmail(b.email),name=text(b.name,'name',60),phone=canonicalPhone(b.phone);
    if(!NAME_RE.test(name)) throw new AppError(400,'BAD_NAME','Enter the full rider name.','name');
    if(!phone) throw new AppError(400,'BAD_PHONE','Enter a valid Indian mobile number.','phone');
    if(b.approve!==undefined&&typeof b.approve!=='boolean') throw new AppError(400,'BAD_APPROVAL','Approval must be explicitly confirmed.','approve');
    const details=validateDriverFields(b,phone);
    if(!details.ok) throw new AppError(400,'BAD_RIDER',details.error.message,details.error.field);
    const identity=await verifiedPartnerIdentity(email,'email');
    const cityId=text(b.cityId,'cityId',64),zoneId=text(b.zoneId,'zoneId',64);
    const row=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity.id},81971))`;
      const user=await eligibleRiderAccount(tx,identity.id,email);
      const city=await tx.city.findUnique({where:{id:cityId}}),zone=await tx.deliveryZone.findUnique({where:{id:zoneId}});
      if(!city?.active||!zone?.active||zone.cityId!==cityId) throw new AppError(400,'ZONE_MISMATCH','Choose an enabled delivery zone in the selected enabled city.','zoneId');
      await tx.user.update({where:{id:user.id},data:{role:'DRIVER'}});
      const rider=await tx.driverPartner.create({data:{userId:user.id,name,phone,runnerCode:await newRunnerCode(),...details.data,cityId,serviceZoneId:zoneId,approvalStatus:b.approve===true?'APPROVED':'PENDING',appliedAt:new Date(),reviewedAt:b.approve===true?new Date():null,dutyStatus:'OFFLINE'}});
      await tx.riderInvitation.updateMany({where:{email,state:'VERIFIED',acceptedBySubject:identity.id,expiresAt:{gt:new Date()}},data:{state:'COMPLETED',completedAt:new Date(),completedDriverId:rider.id}});
      await tx.adminAuditLog.create({data:{action:'RIDER_ONBOARDED',targetType:'DRIVER',targetId:rider.id,summary:`Operator ${req.user!.id} created a ${rider.approvalStatus.toLowerCase()} offline rider with verified provider identity and service area.`}});
      return rider;
    });
    req.app.get('io')?.to('admins').emit('partner_application',{kind:'DRIVER',id:row.id});
    res.status(201).json({success:true,data:row});
  }catch(e){fail(res,e,'Rider could not be created');}
});
