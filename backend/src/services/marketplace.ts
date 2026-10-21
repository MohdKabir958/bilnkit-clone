import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { kmBetween } from './geography';
import { AppError } from '../utils/appError';

export const isCashOrder = (o: { paymentMethod?: string; workflowVersion?: number }) => o.workflowVersion === 2 && o.paymentMethod === 'COD';
export const fulfillmentAuthorized = (o: { paymentStatus: string; paymentMethod?: string; workflowVersion?: number }) => o.paymentStatus === 'PAID' || (isCashOrder(o) && o.paymentStatus === 'PENDING');
export const fulfillmentWhere: Prisma.OrderWhereInput = { OR: [{ paymentStatus: 'PAID' }, { workflowVersion: 2, paymentMethod: 'COD', paymentStatus: 'PENDING' }] };

/** Business readiness, independent of Clerk login. Never adopts an account by contact email. */
export async function requireMarketplaceStore(db: Prisma.TransactionClient | typeof prisma, id: string, lock = false) {
  if (lock) await db.$queryRaw`SELECT "id" FROM "Vendor" WHERE "id"=${id} FOR SHARE`;
  const v = await db.vendor.findUnique({ where: { id }, include: { user: true, primaryCategory: true, city: true } });
  if (!v || v.approvalStatus !== 'APPROVED' || !v.user || v.user.deletedAt || v.user.role !== 'VENDOR' || !v.primaryCategory?.isActive || !v.primaryCategory.forRestaurants || !v.locationSource || !v.city?.active) throw new AppError(409, 'STORE_SETUP_REQUIRED', 'This store is not ready for new orders. Choose another store.');
  if (lock) {
    await db.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${v.user.id} FOR SHARE`;
    await db.$queryRaw`SELECT "id" FROM "Category" WHERE "id"=${v.primaryCategory.id} FOR SHARE`;
  }
  const state = v.user.clerkUserId ? await db.clerkIdentityState.findUnique({ where: { clerkUserId: v.user.clerkUserId } }) : null;
  if (state?.suspended || state?.deleted || state?.deleteRequested) throw new AppError(409,'STORE_SETUP_REQUIRED','This store is not available.');
  return v;
}

/** New delivery transitions require a current assigned-trip fix near the actual pin. */
export async function requireRiderAt(db:Prisma.TransactionClient|typeof prisma,o:{workflowVersion:number;driverId:string|null},point:{lat:number;lng:number}|null) {
  if(o.workflowVersion!==2)return;
  const fix=o.driverId?await db.driverLocation.findUnique({where:{driverId:o.driverId}}):null;
  if(!point||!fix||Date.now()-fix.lastUpdated.getTime()>120000||kmBetween(fix,point)>0.2)throw new AppError(409,'ARRIVAL_LOCATION_REQUIRED','Refresh your GPS near the confirmed pickup or delivery pin before continuing.');
}
