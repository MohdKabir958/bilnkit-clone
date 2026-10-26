import { canExpireUnpaidOrder } from './checkoutRecovery';
import { JobAborted } from './jobs';
import { isCashOrder } from './marketplace';
import { flushNotificationIntents } from './push/intents';
import { pruneRiderLocations } from '../realtime';
import { runDispatchMaintenance } from './dispatch';
import { prisma } from '../db';
import { paymentWindowMin, vendorAcceptWindowMin, MAX_REFUND_ATTEMPTS, REFUND_LEASE_MS } from '../config/orderFlow';
import { cancelOrder, isAbandonedOrder } from './orderFlow';
import { PAYABLE_SELECT, payableAmount } from './orderView';
import { runRefund, refundExtraPayment } from './refundService';
import { createBreaker, runPool } from './providerPool';
import { reconcilePendingPayments } from './paymentReconcile';
import { runPushMaintenance, pruneOldPushData } from './push/pushService';
import { runDailySettlementJob } from './settlement';

const SYSTEM = { id: 'system', role: 'SYSTEM' };
const BATCH = 100;
let lastPushPrune = 0;

/**
 * One pass of the order housekeeping (contract 1.3). Deterministic for a given `now`, and safe to run
 * twice at the same time: every cancel re-checks its condition under the order row lock and refunds
 * use a lease, so a second runner finds nothing left to do.
 *  1. Unpaid orders older than PAYMENT_WINDOW_MIN -> CANCELLED by SYSTEM ('Payment not completed').
 *  2. Paid orders the restaurant has not accepted within VENDOR_ACCEPT_WINDOW_MIN of payment ->
 *     CANCELLED by SYSTEM ('Restaurant did not respond') + refund.
 *  3. Provider phase (Razorpay calls), only after 1 and 2 are done and never waited for by them: at most 5 calls in flight, each
 *     bounded by the provider timeout, and the whole phase stops after 3 transient provider failures in a row (circuit breaker).
 *     a. Refunds: new ones from step 2, FAILED ones whose backoff has passed (permanent failures stop after MAX_REFUND_ATTEMPTS,
 *        transient ones never count), PENDING ones left by a dead worker.
 *     b. Extra (duplicate) payments that still need their refund.
 *     c. Reconcile: unpaid Payment rows older than 2 minutes are looked up at Razorpay (lost webhook + closed app).
 */
export type MaintenanceOptions = { signal?: AbortSignal; checkpoint?: () => Promise<void>; includeAuxiliary?: boolean; includeLifecycle?: boolean; includeProvider?: boolean; reportFailures?: boolean };
export const runOrderMaintenance = async (now: Date = new Date(), options: MaintenanceOptions = {}) => {
  const checkpoint = async () => { if (options.signal?.aborted) throw new JobAborted(); await options.checkpoint?.(); };
  let failures = 0;
  await checkpoint();
  const payCutoff = new Date(now.getTime() - paymentWindowMin() * 60_000);
  const acceptCutoff = new Date(now.getTime() - vendorAcceptWindowMin() * 60_000);
  const summary = {
    expired: [] as string[], autoCancelled: [] as string[], refundsRetried: [] as string[], refundsDone: [] as string[],
    extraRefundsDone: [] as string[], autoRefunds: [] as string[], reconciledPaid: [] as string[], reconciledLateRefund: [] as string[], reconcileFlagged: [] as string[],
    providerPhaseStopped: false,
  };

  if(options.includeLifecycle !== false) {
  const unpaid = await prisma.order.findMany({
    where: { status: 'PLACED', paymentMethod:'ONLINE', paymentStatus: { in: ['PENDING', 'FAILED'] }, createdAt: { lt: payCutoff } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });

  // paidAt is only set by markOrderPaid, so legacy rows without it are never auto-refunded (they show in needs-attention).
  const unaccepted = await prisma.order.findMany({
    where: { status: 'PLACED', OR:[{paymentStatus:'PAID',paidAt:{lt:acceptCutoff}},{workflowVersion:2,paymentMethod:'COD',paymentStatus:'PENDING',createdAt:{lt:acceptCutoff}}] },
    select: { id: true },
    orderBy: { paidAt: 'asc' },
    take: BATCH,
  });
  for (const { id } of unaccepted) {
    await checkpoint();
    try {
      const r = await cancelOrder(id, SYSTEM, 'SYSTEM', 'Restaurant did not respond', {
        guard: (o) => o.status === 'PLACED' && ((o.paymentStatus === 'PAID' && !!o.paidAt && o.paidAt < acceptCutoff) || (isCashOrder(o) && o.createdAt < acceptCutoff)),
        deferRefund: true, // the refund is run below, inside the bounded provider phase
      });
      if (r && !r.idempotent) {
        summary.autoCancelled.push(id);
        // Docs/22: the refund of a combined order is carried by its primary child, whichever child timed out.
        if (r.refundOrderId) summary.autoRefunds.push(r.refundOrderId);
      }
    } catch (err) {
      failures += 1; console.error(`maintenance: auto-cancelling ${id} failed; next job will retry.`);
    }
  }

  for (const { id } of unpaid) {
    await checkpoint();
    try {
      if (!await canExpireUnpaidOrder(id, now, {observeProvider: options.includeProvider !== false})) continue;
      const r = await cancelOrder(id, SYSTEM, 'SYSTEM', 'Payment not completed', {
        guard: (o,g) => isAbandonedOrder(o,g,now.getTime()) && o.createdAt < payCutoff,
      });
      if (r && !r.idempotent) summary.expired.push(id);
    } catch (err) {
      failures += 1; console.error(`maintenance: expiring ${id} failed; next job will retry.`);
    }
  }

  }
  if (options.includeAuxiliary !== false) {
  await checkpoint();
  await prisma.driverPartner.updateMany({where:{availabilityAt:{lt:new Date(now.getTime()-120000)}},data:{availabilityAt:null,availabilityLat:null,availabilityLng:null}});
  await pruneRiderLocations(now).catch(()=>console.error('Location retention cleanup failed.'));
  await runDispatchMaintenance(now, undefined, false, options.signal).catch(()=>{ failures += 1; console.error('Dispatch maintenance failed; retrying next tick.'); });
  }

  // ---- provider phase ----
  const breaker = createBreaker();
  if(options.includeProvider !== false) {
  const due = await prisma.order.findMany({
    where: {
      OR: [
        // FAILED: permanent failures are capped; the "not before" time of transient failures is refundLeaseUntil.
        { refundStatus: 'FAILED', refundAttempts: { lt: MAX_REFUND_ATTEMPTS }, OR: [{ refundLeaseUntil: null }, { refundLeaseUntil: { lt: now } }] },
        { refundStatus: 'PENDING', refundLeaseUntil: { lt: now } },
        // Left PENDING without a lease: the process stopped between the cancel and the refund call.
        { refundStatus: 'PENDING', refundLeaseUntil: null, updatedAt: { lt: new Date(now.getTime() - REFUND_LEASE_MS) } },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
    take: BATCH,
  });
  const refundIds = [...new Set([...summary.autoRefunds, ...due.map((o) => o.id)])];
  await checkpoint();
  await runPool(refundIds, breaker, async (id) => {
    await checkpoint();
    const r = await runRefund(id, now);
    if (r.outcome !== 'SKIPPED') summary.refundsRetried.push(id);
    if (r.outcome === 'DONE') summary.refundsDone.push(id);
    return { transient: r.outcome === 'FAILED' && r.transient, neutral: r.outcome === 'SKIPPED' };
  }, undefined, options.signal);

  // Extra payments (captured twice): the refund is retried here with backoff; "not before" is Payment.refundedAt.
  if (!breaker.open) {
    const extras = await prisma.payment.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        capturedAmountPaise: { not: null },
        razorpayPaymentId: { not: null },
        OR: [{ refundedAt: null }, { refundedAt: { lt: now } }],
        order: { paymentStatus: { in: ['PAID', 'REFUNDED'] } },
      },
      select: { id: true, orderId: true, razorpayPaymentId: true, capturedAmountPaise: true, order: { select: PAYABLE_SELECT } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    // Only true duplicates (the right amount, refunded in full); a wrong amount stays flagged for the admin.
    const duplicates = extras.filter((x) => x.capturedAmountPaise === Math.round(payableAmount(x.order) * 100));
    await runPool(duplicates, breaker, async (x) => {
      await checkpoint();
      const r = await refundExtraPayment({ orderId: x.orderId, providerPaymentId: x.razorpayPaymentId!, amountPaise: x.capturedAmountPaise!, paymentRowId: x.id }, now);
      if (r.outcome === 'DONE') summary.extraRefundsDone.push(x.id);
      return { transient: r.outcome === 'FAILED' && r.transient, neutral: r.outcome === 'SKIPPED' };
    }, undefined, options.signal);
  }

  if (!breaker.open) {
    try {
      await checkpoint();
      const rec = await reconcilePendingPayments(now, breaker);
      summary.reconciledPaid.push(...rec.paid);
      summary.reconciledLateRefund.push(...rec.refundedLate);
      summary.reconcileFlagged.push(...rec.flagged);
    } catch (err) {
      failures += 1; console.error('maintenance: reconcile failed; next job will retry.');
    }
  }
  }
  if (options.includeAuxiliary !== false) {
  await checkpoint();
  await flushNotificationIntents(now).catch(()=>console.error('Notification outbox retry failed.'));
  // Push (FCM): retry transient failures whose backoff has passed, and clean old rows once an hour. Never affects the rest of the tick.
  try {
    await runPushMaintenance(now);
    if (now.getTime() - lastPushPrune >= 60 * 60_000) {
      lastPushPrune = now.getTime();
      await pruneOldPushData(now);
    }
  } catch (err) {
    console.error('maintenance: push retry/prune failed:', (err as Error)?.name ?? 'error');
  }
  // Docs/21 phase 2: the daily restaurant settlement (once per IST day after settlement.time). Idempotent and race-safe, never affects the rest of the tick.
  // Not run by the order-flow test suites (they call this function with real clocks and must not see settlements appear); settlement.test.ts opts in.
  if (process.env.NODE_ENV !== 'test' || process.env.SETTLEMENT_JOB_IN_TEST === '1') {
    try {
      const r = await runDailySettlementJob(now);
      if (r && r.created.length > 0) console.log(`daily settlement: ${r.created.length} settlement(s), ${r.orderCount} order(s)`);
    } catch (err) {
      console.error('maintenance: daily settlement failed:', (err as Error)?.message ?? 'error');
    }
  }
  }
  await checkpoint();
  summary.providerPhaseStopped = breaker.open;
  if (breaker.open) console.warn('order maintenance: payment provider phase stopped after repeated provider failures; the next tick tries again.');

  const touched = summary.expired.length + summary.autoCancelled.length + summary.refundsRetried.length + summary.reconciledPaid.length + summary.reconciledLateRefund.length + summary.extraRefundsDone.length;
  if (touched > 0) {
    console.log(`order maintenance: expired ${summary.expired.length}, auto-cancelled ${summary.autoCancelled.length}, refunds retried ${summary.refundsRetried.length} (${summary.refundsDone.length} done), reconciled ${summary.reconciledPaid.length} paid + ${summary.reconciledLateRefund.length} late-refunded, extra refunds ${summary.extraRefundsDone.length}`);
  }
  if (options.reportFailures && (failures > 0 || breaker.open)) throw Object.assign(new Error('Order maintenance needs retry; see resource-level diagnostics.'), { code: breaker.open ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'ORDER_MAINTENANCE_FAILED' });
  return summary;
};

/** Compatibility entrypoint; production uses the centralized durable registry in backgroundWorker.ts. */
export const startOrderMaintenance = async () => {
  const { startBackgroundWorker } = await import('./backgroundWorker');
  return startBackgroundWorker();
};
