import { DurableJobWorker, JobSpec, JobStore } from './jobs';
import { runOrderMaintenance } from './orderMaintenance';
import { runDispatchMaintenance } from './dispatch';
import { flushNotificationIntents } from './push/intents';
import { runPushMaintenance, pruneOldPushData } from './push/pushService';
import { runDailySettlementJob } from './settlement';
import { pruneRiderLocations } from '../realtime';
import { retryClerkDeletions } from './clerkIdentity';
import { prisma } from '../db';
import { runSupportEscalation } from './operationsReadiness';
import { purgeExpiredSupportEvidence } from './supportEvidence';
import { runSlaMaintenance } from './operationalSla';
import { expireOrderAdjustments } from './orderAdjustments';
import { runPartialRefunds } from './partialRefunds';
import { usesClerk } from '../config/authMode';

/** Only periodic, idempotent operations belong here. HTTP handlers never own a scheduler. */
export function backgroundJobSpecs(store = new JobStore()): JobSpec[] {
  return [
    { name: 'dispatch.offers', intervalMs: 15_000, handler: async c => {
      await c.checkpoint(); await runDispatchMaintenance(c.now, undefined, false, c.signal);
    } },
    { name: 'orders.expiry', intervalMs: 60_000, handler: async c => {
      await runOrderMaintenance(c.now, { signal: c.signal, checkpoint: c.checkpoint, includeAuxiliary: false, includeProvider:false, reportFailures: true });
    } },
    { name: 'payments.reconcile-refunds', intervalMs: 60_000, handler: async c => {
      await runOrderMaintenance(c.now, { signal:c.signal, checkpoint:c.checkpoint, includeAuxiliary:false, includeLifecycle:false, reportFailures:true });
    } },
    { name: 'payments.partial-refunds', intervalMs: 60_000, handler: async c => { await c.checkpoint(); await runPartialRefunds(20,c.signal); } },
    { name: 'orders.adjustment-expiry', intervalMs: 30_000, handler: async c => { await c.checkpoint(); await expireOrderAdjustments(100,c.now); } },
    { name: 'notifications.outbox', intervalMs: 15_000, handler: async c => {
      await flushNotificationIntents(c.now, { signal: c.signal, checkpoint: c.checkpoint });
    } },
    { name: 'notifications.retry', intervalMs: 30_000, handler: async c => {
      await c.checkpoint(); await runPushMaintenance(c.now, { signal: c.signal, awaitCompletion: true });
    } },
    { name: 'operations.sla', intervalMs: 60_000, handler: async c => { await c.checkpoint(); await runSlaMaintenance(c.now,c.signal); } },
    { name: 'locations.retention', intervalMs: 60_000, handler: async c => {
      await c.checkpoint();
      await prisma.driverPartner.updateMany({ where: { availabilityAt: { lt: new Date(c.now.getTime() - 120_000) } }, data: { availabilityAt: null, availabilityLat: null, availabilityLng: null } });
      await c.checkpoint(); await pruneRiderLocations(c.now);
    } },
    { name: 'settlements.daily', intervalMs: 60_000, handler: async c => {
      await c.checkpoint(); await runDailySettlementJob(c.now);
    } },
    { name: 'identity.deletions', intervalMs: 60_000, handler: async c => {
      await c.checkpoint(); if (usesClerk()) await retryClerkDeletions(c.signal);
    } },
    { name: 'support.escalation', intervalMs: 60_000, handler: async c => { await c.checkpoint(); await runSupportEscalation(c.now); } },
    { name: 'support.evidence-retention', intervalMs: 3_600_000, handler: async c => { await c.checkpoint(); await purgeExpiredSupportEvidence(c.now); } },
    { name: 'retention.history', intervalMs: 3_600_000, handler: async c => {
      await c.checkpoint(); await pruneOldPushData(c.now);
      await c.checkpoint(); await store.prune(c.now);
    } },
  ];
}

let active: DurableJobWorker | undefined;
export async function startBackgroundWorker() {
  if (active) return active;
  const store = new JobStore();
  active = new DurableJobWorker(backgroundJobSpecs(store), store);
  // Worker initialization retries on the next poll if PostgreSQL is temporarily unavailable.
  active.start();
  return active;
}
export async function stopBackgroundWorker() {
  const worker = active; active = undefined;
  await worker?.stop();
}
