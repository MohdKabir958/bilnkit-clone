import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { Actor, withOrderLock, preAuthorize, loadOrder } from './orderFlow';
import { lockProducts, adjustOrderReservation, recordStockDisposition, ensureStockAvailable } from './inventory';
import { validateAndCalculateOrder } from '../utils/validation';
import { toPaise } from './pricing';
import { publishOrderChange } from '../realtime';

const key = (v: unknown) => {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(v)) throw new AppError(400, 'REQUEST_KEY_REQUIRED', 'Use a unique request key.');
  return v;
};
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const nextUpdate = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1));
const manageable = (o: { workflowVersion: number; groupId: string | null; status: string; settlementId: string | null }) => {
  if (o.workflowVersion !== 2 || o.groupId) throw new AppError(409, 'ADJUSTMENT_UNSUPPORTED', 'Use the existing cancel and refund workflow for this historical combined order.');
  if (!['PLACED', 'ACCEPTED', 'PREPARING'].includes(o.status) || o.settlementId) throw new AppError(409, 'PACKING_ALREADY_COMPLETE', 'Item changes must be agreed before pickup readiness and settlement.');
};
type Proposed = { priced: Awaited<ReturnType<typeof validateAndCalculateOrder>>; items: { itemId: string; quantity: number }[] };
export async function proposeOrderAdjustment(orderId: string, actor: Actor, input: any) {
  await preAuthorize(orderId, o => actor.role === 'ADMIN' || actor.role === 'VENDOR' && o.vendorUserId === actor.id);
  const requestKey = key(input?.requestKey), reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 5 || reason.length > 300) throw new AppError(400, 'REASON_REQUIRED', 'Explain the unavailable item and proposed alternative in 5–300 characters.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 30 || input.items.some((i: any) => typeof i?.itemId !== 'string' || i.itemId.length > 64 || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 20) || new Set(input.items.map((i: any) => i.itemId)).size !== input.items.length) throw new AppError(400, 'INVALID_ITEMS', 'Choose distinct products and valid quantities. Cancel the order if no products can be supplied.');
  const result = await withOrderLock(orderId, async (tx, o) => {
    if (actor.role !== 'ADMIN' && (actor.role !== 'VENDOR' || o.vendor.userId !== actor.id || o.vendor.approvalStatus !== 'APPROVED')) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
    const replay = await tx.orderAdjustment.findUnique({ where: { orderId_requestKey: { orderId, requestKey } } });
    if (replay) {
      const previous = replay.proposedItems as unknown as Proposed;
      if (replay.reason !== reason || JSON.stringify(previous.items) !== JSON.stringify(input.items)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This request key identifies a different proposal.');
      return replay;
    }
    manageable(o);
    if (o.paymentMethod === 'ONLINE' && o.paymentStatus !== 'PAID') throw new AppError(409, 'PAYMENT_NOT_CONFIRMED', 'Confirm payment or cancel unpaid checkout before proposing item changes.');
    if (await tx.orderAdjustment.count({ where: { orderId, state: 'PROPOSED' } })) throw new AppError(409, 'DECISION_PENDING', 'Wait for the customer to answer the existing proposal.');
    const held = await tx.inventoryReservation.findMany({where:{orderId,state:'HELD'}});
    await lockProducts(tx, [...held.map(r=>r.menuItemId), ...input.items.map((i: any) => i.itemId)]);
    const priced = await validateAndCalculateOrder(o.vendorId, input.items, o.couponCode ?? undefined, toPaise(o.deliveryFee), tx);
    if (!priced.isValid) throw new AppError(409, 'INVALID_ITEMS', priced.errorMessage ?? 'Proposed products are unavailable.');
    const extra=input.items.map((i:{itemId:string;quantity:number})=>({itemId:i.itemId,quantity:Math.max(0,i.quantity-(held.find(r=>r.menuItemId===i.itemId)?.quantity??0))})).filter((i:{quantity:number})=>i.quantity>0);
    if(extra.length)await ensureStockAvailable(extra,tx);
    const total = toPaise(priced.calculatedTotalAmount), original = toPaise(o.totalAmount);
    if (total > original) throw new AppError(409, 'ADDITIONAL_PAYMENT_UNSUPPORTED', 'Choose a same-price or cheaper alternative. Grozo will not charge the customer extra for a substitution.');
    if (total === original && JSON.stringify(o.items.map(i => ({ itemId: i.menuItemId, quantity: i.quantity })).sort((a,b)=>String(a.itemId).localeCompare(String(b.itemId)))) === JSON.stringify([...input.items].sort((a,b)=>a.itemId.localeCompare(b.itemId)))) throw new AppError(400, 'NO_ITEM_CHANGE', 'Choose a changed item or quantity.');
    // This is a store-reported shortage, not a customer returning usable goods. Missing packs must never be
    // put back on sale when the customer accepts a smaller basket or the order is later cancelled.
    for (const reservation of held) {
      const supplied = input.items.find((i:any)=>i.itemId===reservation.menuItemId)?.quantity ?? 0;
      const missing = Math.max(0,reservation.quantity-supplied-reservation.unusableQty);
      if (missing) await recordStockDisposition(tx,reservation.id,{action:'MISSING',quantity:missing,reason,actorId:actor.id,clientRequestId:createHash('sha256').update(`shortage:${requestKey}`).digest('hex')});
    }
    const proposal = await tx.orderAdjustment.create({ data: { orderId, customerId: o.customerId, requestedById: actor.id, requestKey, reason,
      originalSnapshot: json({ items: o.items, subtotal: o.subtotal, deliveryFee: o.deliveryFee, taxAndPackaging: o.taxAndPackaging, discount: o.discount, couponCode: o.couponCode, vendorSubtotal: o.vendorSubtotal, commissionTotal: o.commissionTotal, totalAmount: o.totalAmount, updatedAt: o.updatedAt }),
      proposedItems: json({ priced, items: input.items }), originalTotalPaise: original, proposedTotalPaise: total, refundDuePaise: original - total,
      expiresAt: new Date(Date.now() + 10 * 60_000) } });
    await tx.adminAuditLog.create({ data: { action: 'ITEM_CHANGE_PROPOSED', targetType: 'ORDER', targetId: orderId, summary: `Proposal ${proposal.id} by ${actor.id}; customer decision required; reduction ${original-total} paise.` } });
    await tx.notificationIntent.create({ data: { orderId, event: 'ORDER_UPDATED', options: {} } });
    await tx.order.update({where:{id:orderId},data:{updatedAt:nextUpdate(o.updatedAt)}});
    return proposal;
  });
  const order = await loadOrder(orderId); if (order) await publishOrderChange(order);
  return result;
}

export async function decideOrderAdjustment(id: string, actor: Actor, input: any) {
  const proposal = await prisma.orderAdjustment.findUnique({ where: { id } });
  if (!proposal || actor.role !== 'STUDENT' || proposal.customerId !== actor.id) throw new AppError(404, 'NOT_FOUND', 'Item proposal not found.');
  const decisionKey = key(input?.requestKey), accept = input?.decision === 'ACCEPT';
  if (!['ACCEPT', 'REJECT'].includes(input?.decision) || !Number.isInteger(input?.version)) throw new AppError(400, 'INVALID_DECISION', 'Choose accept or reject for the current proposal version.');
  const result = await withOrderLock(proposal.orderId, async (tx, o) => {
    const p = await tx.orderAdjustment.findUniqueOrThrow({ where: { id } });
    if (p.state !== 'PROPOSED') {
      if (p.decisionKey === decisionKey && (accept ? p.state === 'APPLIED' : p.state === 'REJECTED')) return p;
      throw new AppError(409, 'DECISION_ALREADY_RECORDED', 'This proposal has already been answered. Refresh the order.');
    }
    if (p.version !== input.version || p.expiresAt <= new Date()) throw new AppError(409, 'PROPOSAL_EXPIRED', 'This proposal expired or changed. Ask the store for a fresh proposal.');
    manageable(o);
    if (toPaise(o.totalAmount) !== p.originalTotalPaise || o.refundStatus && o.refundStatus !== 'NONE') throw new AppError(409, 'ORDER_CHANGED', 'The order changed. Refresh before answering.');
    if (!accept) {
      const rejected = await tx.orderAdjustment.update({ where: { id }, data: { state: 'REJECTED', decisionKey, decidedAt: new Date(), version: { increment: 1 } } });
      await tx.order.update({where:{id:o.id},data:{updatedAt:nextUpdate(o.updatedAt)}});
      await tx.adminAuditLog.create({ data: { action: 'ITEM_CHANGE_REJECTED', targetType: 'ORDER', targetId: o.id, summary: `Customer ${actor.id} rejected ${id}. Original order remains; store must resolve or cancel.` } });
      return rejected;
    }
    const proposed = p.proposedItems as unknown as Proposed;
    const ids = [...o.items.flatMap(i => i.menuItemId ? [i.menuItemId] : []), ...proposed.items.map(i => i.itemId)];
    await lockProducts(tx, ids);
    const products = await tx.menuItem.findMany({ where: { id: { in: proposed.items.map(i => i.itemId) }, vendorId: o.vendorId, approvalStatus: 'APPROVED', deletedAt: null, isAvailable: true } });
    if (products.length !== proposed.items.length) throw new AppError(409, 'PROPOSAL_UNAVAILABLE', 'An alternative is no longer available. Ask the store for another proposal.');
    for (const productId of [...new Set(ids)].sort()) await adjustOrderReservation(tx, o.id, productId, proposed.items.find(i => i.itemId === productId)?.quantity ?? 0, id);
    const priced = proposed.priced;
    await tx.orderItem.deleteMany({ where: { orderId: o.id } });
    await tx.orderItem.createMany({ data: priced.verifiedItems.map(i => ({ orderId: o.id, menuItemId: i.itemId, name: i.name, quantity: i.quantity, price: i.price, vendorUnitPrice: i.vendorUnitPrice, commissionUnit: i.commissionUnit, productSnapshot: i.productSnapshot })) });
    await tx.order.update({ where: { id: o.id }, data: { subtotal: priced.calculatedSubtotal, deliveryFee: priced.calculatedDeliveryFee, taxAndPackaging: priced.calculatedTaxAndPackaging,
      discount: priced.calculatedDiscount, totalAmount: p.proposedTotalPaise / 100, vendorSubtotal: priced.calculatedVendorSubtotal, commissionTotal: priced.calculatedCommissionTotal,
      feeBreakdown: priced.feeBreakdown as unknown as Prisma.InputJsonValue, couponCode: priced.appliedCoupon ?? null, updatedAt:nextUpdate(o.updatedAt) } });
    if (p.refundDuePaise && o.paymentMethod === 'ONLINE') {
      const payment = o.payments.find(row => row.status === 'PAID' && row.razorpayPaymentId);
      if (!payment) throw new AppError(409, 'CAPTURE_NOT_CONFIRMED', 'The captured payment must be confirmed before accepting this change.');
      await tx.paymentRefund.create({ data: { paymentId: payment.id, orderId: o.id, adjustmentId: id, amountPaise: p.refundDuePaise, reason: p.reason, idempotencyKey: `adjustment:${id}` } });
    }
    const applied = await tx.orderAdjustment.update({ where: { id }, data: { state: 'APPLIED', decisionKey, decidedAt: new Date(), appliedAt: new Date(), version: { increment: 1 } } });
    await tx.adminAuditLog.create({ data: { action: 'ITEM_CHANGE_ACCEPTED', targetType: 'ORDER', targetId: o.id, summary: `Customer ${actor.id} approved ${id}. New total ${p.proposedTotalPaise} paise; ${o.paymentMethod === 'COD' ? 'cash due reduced' : 'refund queued, not yet completed'} ${p.refundDuePaise} paise.` } });
    return applied;
  });
  const order = await loadOrder(proposal.orderId); if (order) await publishOrderChange(order);
  return result;
}

export async function expireOrderAdjustments(limit = 100, now = new Date()) {
  const candidates = await prisma.orderAdjustment.findMany({ where: { state: 'PROPOSED', expiresAt: { lte: now } }, take: limit, select: { id: true, orderId: true } });
  for (const p of candidates) {
    const changed=await withOrderLock(p.orderId,async(tx,o)=>{
      const result=await tx.orderAdjustment.updateMany({where:{id:p.id,state:'PROPOSED',expiresAt:{lte:now}},data:{state:'EXPIRED',version:{increment:1}}});
      if(!result.count)return false;
      await tx.order.update({where:{id:o.id},data:{updatedAt:nextUpdate(o.updatedAt)}});
      await tx.adminAuditLog.create({data:{action:'ITEM_CHANGE_EXPIRED',targetType:'ORDER',targetId:o.id,summary:`Proposal ${p.id} expired without customer approval. No items or money changed; recorded shortage still requires resolution.`}});
      return true;
    });
    if(changed){const order=await loadOrder(p.orderId);if(order)await publishOrderChange(order);}
  }
  return candidates.length;
}
