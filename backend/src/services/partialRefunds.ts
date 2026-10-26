import { randomUUID } from 'crypto';
import { prisma } from '../db';
import { getPaymentProvider, withProviderTimeout, toProviderError } from './paymentService';
import { withOrderLock } from './orderFlow';
import { publishOrderChange } from '../realtime';
import { ORDER_VIEW_INCLUDE } from './orderView';

/** Monetary provider effects are at least once observed. An uncertain submission is never blindly submitted again. */
export async function runPartialRefund(id: string, now = new Date()) {
  const initial = await prisma.paymentRefund.findUnique({ where: { id } });
  if (!initial) return 'SKIPPED';
  const token = randomUUID(), until = new Date(now.getTime() + 120_000);
  const claim = await withOrderLock(initial.orderId, async (tx, order) => {
    const row = await tx.paymentRefund.findUniqueOrThrow({ where: { id }, include: { payment: true } });
    if (['PROCESSED', 'VOID', 'FAILED'].includes(row.state) || row.nextAttemptAt > now || row.leaseUntil && row.leaseUntil >= now || order.refundLeaseUntil && order.refundLeaseUntil >= now) return null;
    if (order.status === 'CANCELLED') {
      // A submitted partial must still be observed; the full refund subtracts it from the captured amount.
      if (!row.submitStartedAt) { await tx.paymentRefund.update({ where: { id }, data: { state: 'VOID', lastErrorCode: 'FULL_REFUND_SUPERSEDED' } }); return null; }
    }
    if (!row.payment.razorpayPaymentId || row.payment.capturedAmountPaise === null || !['PAID','REFUNDED'].includes(row.payment.status)) return null;
    await tx.paymentRefund.update({ where: { id }, data: { leaseToken: token, leaseUntil: until, attempts: { increment: 1 } } });
    // Share the existing full-refund lease to serialize refund submissions for the same captured payment.
    await tx.order.update({ where: { id: order.id }, data: { refundLeaseUntil: until } });
    return row;
  });
  if (!claim) return 'SKIPPED';
  let state = 'UNKNOWN', providerRefundId = claim.providerRefundId, errorCode: string | null = null;
  let submissionStarted = !!claim.submitStartedAt;
  try {
    const provider = getPaymentProvider(), existing = await withProviderTimeout(provider.listRefunds(claim.payment.razorpayPaymentId!));
    const receipt = `pa_${id}`.slice(0, 40);
    let refund = existing.find(r => r.id === providerRefundId || r.receipt === receipt);
    if (!refund && !submissionStarted) {
      const reserved = existing.filter(r => r.status !== 'failed').reduce((sum, r) => sum + r.amountPaise, 0);
      if (reserved + claim.amountPaise > claim.payment.capturedAmountPaise!) throw Object.assign(new Error('Refund exceeds captured amount'), { statusCode: 400 });
      const marked = await prisma.paymentRefund.updateMany({where:{id,leaseToken:token,leaseUntil:{gt:new Date()},submitStartedAt:null},data:{submitStartedAt:new Date()}});
      if (!marked.count) throw Object.assign(new Error('Refund ownership ended before submission'),{code:'LEASE_LOST'});
      submissionStarted = true;
      refund = await withProviderTimeout(provider.refundPayment({ paymentId: claim.payment.razorpayPaymentId!, amountPaise: claim.amountPaise, receipt, notes: { orderId: claim.orderId, adjustmentId: claim.adjustmentId ?? '', refundRequestId: id } }));
    }
    if (refund) {
      if (refund.amountPaise !== claim.amountPaise) throw Object.assign(new Error('Provider refund amount mismatch'), { statusCode: 400 });
      providerRefundId = refund.id;
      state = refund.status === 'processed' ? 'PROCESSED' : refund.status === 'failed' ? 'FAILED' : 'SUBMITTED';
      if (state === 'FAILED') errorCode = 'PROVIDER_REFUND_FAILED';
    } else errorCode = 'SUBMISSION_UNCONFIRMED';
  } catch (error) {
    const e = toProviderError(error);
    state = e.transient ? (submissionStarted ? 'UNKNOWN' : 'PENDING') : 'FAILED';
    errorCode = e.providerCode ?? (e.transient ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED');
  }
  await withOrderLock(claim.orderId, async (tx, order) => {
    const changed = await tx.paymentRefund.updateMany({ where: { id, leaseToken: token }, data: { state, providerRefundId, lastErrorCode: errorCode,
      processedAt: state === 'PROCESSED' ? new Date() : null, leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** Math.min(6, claim.attempts)) * 60_000) } });
    if (!changed.count) return;
    if (order.refundLeaseUntil?.getTime() === until.getTime()) await tx.order.update({ where: { id: order.id }, data: { refundLeaseUntil: null } });
    await tx.adminAuditLog.create({ data: { action: 'PARTIAL_REFUND_OBSERVED', targetType: 'ORDER', targetId: order.id,
      summary: `Request ${id}: ${state}; ${claim.amountPaise} paise. Original captured payment retained. ${errorCode ?? ''}` } });
  });
  const order = await prisma.order.findUnique({ where: { id: claim.orderId }, include: ORDER_VIEW_INCLUDE });
  if (order) await publishOrderChange(order);
  return state;
}

export async function runPartialRefunds(limit = 20, signal?: AbortSignal) {
  const rows = await prisma.paymentRefund.findMany({ where: { state: { in: ['PENDING', 'SUBMITTED', 'UNKNOWN'] }, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, take: Math.min(100, Math.max(1, limit)), orderBy: { nextAttemptAt: 'asc' }, select: { id: true } });
  const outcomes: string[] = [];
  for (const row of rows) { if (signal?.aborted) break; outcomes.push(await runPartialRefund(row.id)); }
  return outcomes;
}

/** Called only after the existing independent Razorpay webhook signature check. Request/payment/amount must all match. */
export async function applyPartialRefundEvent(event: 'refund.processed' | 'refund.failed', input: { refundId: string | null; paymentId: string | null; amountPaise: number | null }) {
  if (!input.refundId || !input.paymentId) return false;
  const request = await prisma.paymentRefund.findUnique({ where: { providerRefundId: input.refundId }, include: { payment: true } });
  if (!request || request.payment.razorpayPaymentId !== input.paymentId || request.amountPaise !== input.amountPaise) return false;
  await withOrderLock(request.orderId, async (tx) => {
    const row = await tx.paymentRefund.findUniqueOrThrow({ where: { id: request.id } });
    // A signed delayed failure cannot reverse a provider-confirmed processed refund.
    if (row.state === 'PROCESSED') return;
    await tx.paymentRefund.update({ where: { id: row.id }, data: { state: event === 'refund.processed' ? 'PROCESSED' : 'FAILED', processedAt: event === 'refund.processed' ? new Date() : null,
      lastErrorCode: event === 'refund.failed' ? 'PROVIDER_REFUND_FAILED' : null, leaseToken: null, leaseUntil: null } });
    await tx.adminAuditLog.create({ data: { action: 'PARTIAL_REFUND_WEBHOOK', targetType: 'ORDER', targetId: row.orderId, summary: `Verified ${event}: ${row.id}, ${row.amountPaise} paise.` } });
  });
  return true;
}
