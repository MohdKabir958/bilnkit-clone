import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { usesClerk } from '../config/authMode';
import { indianPoint, kmBetween, text } from '../services/geography';
import { normalizeAdminEmail } from '../services/adminAccess';
import { verifiedPartnerIdentity } from '../services/clerkIdentity';
import { AppError } from '../utils/appError';
import { fail } from '../utils/http';

export const adminStoresRouter = Router();
adminStoresRouter.post('/v1/admin/stores',requireAuth,requireRole('ADMIN'),async(req:AuthenticatedRequest,res)=>{
  try {
    const b = req.body ?? {}, name = text(b.name,'name',60), address = text(b.address,'address',140), cityId = text(b.cityId,'cityId',64);
    const pinCode = text(b.pinCode,'pinCode',6), locality = text(b.locality,'locality',100);
    if (!/^[1-9]\d{5}$/.test(pinCode) || !indianPoint(b.lat,b.lng)) throw new AppError(400,'BAD_LOCATION','Enter a six-digit PIN and a confirmed location in India.');
    const city = await prisma.city.findUnique({where:{id:cityId}});
    if (!city?.active) throw new AppError(400,'CITY_REQUIRED','Choose an enabled city.','cityId');
    let ownerSubject: string | undefined;
    if (b.ownerEmail) {
      if (!usesClerk()) throw new AppError(400,'CLERK_REQUIRED','Email-based owner assignment requires Clerk authentication.');
      ownerSubject = (await verifiedPartnerIdentity(normalizeAdminEmail(b.ownerEmail))).id;
    }
    const row = await prisma.$transaction(async tx => {
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
      const zone = b.zoneId ? await tx.deliveryZone.findUnique({where:{id:text(b.zoneId,'zoneId',64)}}) : null;
      if (b.zoneId && (!zone?.active || zone.cityId !== cityId || kmBetween({lat:b.lat,lng:b.lng},{lat:zone.centerLat,lng:zone.centerLng}) > zone.radiusKm)) throw new AppError(400,'ZONE_MISMATCH','Choose an enabled zone in this city that contains the store pickup location.','zoneId');
      const store = await tx.vendor.create({data:{name,address,cityId,pinCode,locality,lat:b.lat,lng:b.lng,userId:ownerId,category:'Groceries',bannerImage:'',isAcceptingOrders:false,approvalStatus:'APPROVED',locationSource:'ADMIN',locationSetAt:new Date(),eta:''}});
      if (zone) await tx.vendorCoverage.create({data:{vendorId:store.id,zoneId:zone.id,active:true}});
      await tx.adminAuditLog.create({data:{action:'STORE_CREATED',targetType:'VENDOR',targetId:store.id,summary:`Operator ${req.user!.id} created a closed store with confirmed pickup${ownerId?' and a verified partner owner':''}.`}});
      return store;
    });
    res.status(201).json({success:true,data:row});
  } catch(e) { fail(res,e,'Store could not be created'); }
});
