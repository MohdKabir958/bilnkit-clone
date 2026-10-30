import { Router } from 'express';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { requireApprovedPartner } from './partners';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { fail, validParams } from '../utils/http';
import { proposeOrderAdjustment, decideOrderAdjustment } from '../services/orderAdjustments';
import { preAuthorize } from '../services/orderFlow';
export const orderAdjustmentsRouter = Router();
const wrap = (fn: (req: AuthenticatedRequest, res: any) => Promise<any>) => async (req: AuthenticatedRequest, res: any) => { try { await fn(req, res); } catch (e) { fail(res, e, 'item changes'); } };
orderAdjustmentsRouter.get('/v1/orders/:id/adjustments', requireAuth, requireRole('STUDENT','VENDOR','ADMIN'), validParams('id'), wrap(async (req,res) => {
  await preAuthorize(req.params.id, o => req.user!.role === 'ADMIN' || req.user!.role === 'STUDENT' && o.customerId === req.user!.id || req.user!.role === 'VENDOR' && o.vendorUserId === req.user!.id);
  const rows = await prisma.orderAdjustment.findMany({ where: { orderId: req.params.id }, take: 30, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: rows.map(row => {
    const proposed = row.proposedItems as any;
    return { id:row.id, orderId:row.orderId, state:row.state, version:row.version, reason:row.reason, expiresAt:row.expiresAt,
      items: proposed.priced.verifiedItems.map((i:any)=>({itemId:i.itemId,name:i.name,quantity:i.quantity,...(req.user!.role==='VENDOR'?{}:{price:i.price})})),
      ...(req.user!.role==='VENDOR'?{}:{amounts:{subtotal:proposed.priced.calculatedSubtotal,deliveryFee:proposed.priced.calculatedDeliveryFee,taxAndPackaging:proposed.priced.calculatedTaxAndPackaging,discount:proposed.priced.calculatedDiscount,couponCode:proposed.priced.appliedCoupon??null,couponMessage:proposed.priced.couponProblem??null}}),
      ...(req.user!.role==='VENDOR'?{}:{originalTotalPaise:row.originalTotalPaise,proposedTotalPaise:row.proposedTotalPaise,refundDuePaise:row.refundDuePaise}) };
  }) });
}));
orderAdjustmentsRouter.post('/v1/orders/:id/adjustments', requireAuth, requireRole('VENDOR','ADMIN'), requireApprovedPartner, validParams('id'), wrap(async(req,res)=>{
  const result = await proposeOrderAdjustment(req.params.id,req.user!,req.body);
  // Vendor responses never disclose retail prices, discount or commission snapshots.
  res.status(201).json({success:true,data:{id:result.id,state:result.state,version:result.version,expiresAt:result.expiresAt}});
}));
orderAdjustmentsRouter.post('/v1/order-adjustments/:id/decision',requireAuth,requireRole('STUDENT'),validParams('id'),wrap(async(req,res)=>{
  if(!req.body)throw new AppError(400,'BAD_REQUEST','Choose a decision.');
  const result=await decideOrderAdjustment(req.params.id,req.user!,req.body);
  res.json({success:true,data:{id:result.id,state:result.state,version:result.version}});
}));
