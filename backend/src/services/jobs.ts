import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';

/** Periodic handlers must check ownership between batches and keep their own business idempotency.
 * A lease gives at-least-once execution after a crash; it cannot make an external network side effect exactly once.
 * Claims/heartbeats/finalization use short transactions. No pooled DB connection is held across provider calls.
 */
export type JobState = 'READY' | 'RUNNING' | 'DEAD';
export interface JobRecord {
  name: string; state: JobState; intervalMs: number; maxAttempts: number; attempts: number;
  nextRunAt: Date; leaseToken: string | null; leaseOwner: string | null; leaseUntil: Date | null;
  lastStartedAt: Date | null; lastFinishedAt: Date | null; lastSuccessAt: Date | null;
  lastErrorCode: string | null; recoveryCount: number;
}
export interface JobClaim extends JobRecord { leaseToken: string; leaseOwner: string; leaseUntil: Date }
export interface JobContext {
  now: Date;
  signal: AbortSignal;
  /** Extend the lease or throw before starting the next resource/provider batch. */
  checkpoint: () => Promise<void>;
}
export interface JobSpec {
  name: string;
  intervalMs: number;
  maxAttempts?: number;
  leaseMs?: number;
  maxRuntimeMs?: number;
  handler: (context: JobContext) => Promise<unknown>;
}
const NAME = /^[a-z][a-z0-9._-]{1,79}$/;
const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_RUNTIME_MS = 10 * 60_000;
const baseBackoffMs = 15_000;
export const jobBackoffMs = (attempt: number) => Math.min(30 * 60_000, baseBackoffMs * 2 ** Math.min(10, Math.max(0, attempt - 1)));
export class JobLeaseLost extends Error {
  readonly code = 'JOB_LEASE_LOST';
  constructor() { super('Background job ownership ended.'); }
}
export class JobAborted extends Error {
  readonly code = 'JOB_ABORTED';
  constructor() { super('Background job stopped at a safe checkpoint.'); }
}
/** Store codes, not provider messages/URLs/tokens/phone numbers or Prisma query details. */
export const safeJobErrorCode = (error: unknown): string => {
  const candidate = (error as { code?: unknown })?.code;
  return typeof candidate === 'string' && /^[A-Z0-9_]{2,64}$/.test(candidate) ? candidate : 'JOB_EXECUTION_FAILED';
};
function validate(spec: JobSpec) {
  if (!NAME.test(spec.name)) throw new Error('Invalid background job name.');
  if (!Number.isSafeInteger(spec.intervalMs) || spec.intervalMs < 1000 || spec.intervalMs > 86_400_000) throw new Error('Job interval must be 1 second to 1 day.');
  if (!Number.isSafeInteger(spec.maxAttempts ?? 8) || (spec.maxAttempts ?? 8) < 1 || (spec.maxAttempts ?? 8) > 50) throw new Error('Job retry limit must be 1–50.');
  if (!Number.isSafeInteger(spec.leaseMs ?? DEFAULT_LEASE_MS) || (spec.leaseMs ?? DEFAULT_LEASE_MS) < 1000 || (spec.leaseMs ?? DEFAULT_LEASE_MS) > 600_000) throw new Error('Job lease must be 1 second to 10 minutes.');
  if (!Number.isSafeInteger(spec.maxRuntimeMs ?? DEFAULT_RUNTIME_MS) || (spec.maxRuntimeMs ?? DEFAULT_RUNTIME_MS) < 1000 || (spec.maxRuntimeMs ?? DEFAULT_RUNTIME_MS) > 3_600_000) throw new Error('Job runtime must be bounded to 1 second–1 hour.');
}

type Database = PrismaClient;
export class JobStore {
  constructor(private readonly db: Database = prisma) {}
  async register(spec: JobSpec, now: Date): Promise<void> {
    validate(spec);
    await this.db.$executeRaw`INSERT INTO "BackgroundJob" ("name","intervalMs","maxAttempts","nextRunAt","updatedAt") VALUES (${spec.name},${spec.intervalMs},${spec.maxAttempts ?? 8},${now},${now}) ON CONFLICT ("name") DO UPDATE SET "intervalMs"=EXCLUDED."intervalMs", "maxAttempts"=EXCLUDED."maxAttempts", "updatedAt"=EXCLUDED."updatedAt"`;
  }
  async claim(spec: JobSpec, workerId: string, now: Date): Promise<JobClaim | null> {
    validate(spec);
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<JobRecord[]>`SELECT * FROM "BackgroundJob" WHERE "name"=${spec.name} AND "state"!='DEAD' AND "nextRunAt"<=${now} AND ("leaseUntil" IS NULL OR "leaseUntil"<=${now}) FOR UPDATE SKIP LOCKED`;
      const previous = rows[0];
      if (!previous) return null;
      if (previous.attempts >= previous.maxAttempts) {
        await tx.$executeRaw`UPDATE "BackgroundJob" SET "state"='DEAD',"lastErrorCode"='MAX_ATTEMPTS',"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"updatedAt"=${now} WHERE "name"=${spec.name}`;
        await tx.$executeRaw`UPDATE "BackgroundJobRun" SET "state"='ABANDONED',"finishedAt"=${now},"errorCode"='LEASE_EXPIRED' WHERE "jobName"=${spec.name} AND "state"='RUNNING' AND "leaseUntil"<=${now}`;
        return null;
      }
      const token = randomUUID(), leaseUntil = new Date(now.getTime() + (spec.leaseMs ?? DEFAULT_LEASE_MS));
      const recovered = previous.state === 'RUNNING';
      if (recovered) await tx.$executeRaw`UPDATE "BackgroundJobRun" SET "state"='ABANDONED',"finishedAt"=${now},"errorCode"='LEASE_EXPIRED' WHERE "jobName"=${spec.name} AND "state"='RUNNING' AND "leaseUntil"<=${now}`;
      const claimed = await tx.$queryRaw<JobClaim[]>`UPDATE "BackgroundJob" SET "state"='RUNNING',"attempts"="attempts"+1,"leaseToken"=${token},"leaseOwner"=${workerId},"leaseUntil"=${leaseUntil},"lastStartedAt"=${now},"lastErrorCode"=NULL,"recoveryCount"="recoveryCount"+${recovered ? 1 : 0},"updatedAt"=${now} WHERE "name"=${spec.name} RETURNING *`;
      await tx.$executeRaw`INSERT INTO "BackgroundJobRun" ("id","jobName","workerId","state","startedAt","leaseUntil","recovered") VALUES (${token},${spec.name},${workerId},'RUNNING',${now},${leaseUntil},${recovered})`;
      return claimed[0];
    });
  }
  async heartbeat(claim: JobClaim, leaseMs: number, now: Date): Promise<boolean> {
    const until = new Date(now.getTime() + leaseMs);
    return this.db.$transaction(async tx => {
      const changed = await tx.$executeRaw`UPDATE "BackgroundJob" SET "leaseUntil"=${until},"updatedAt"=${now} WHERE "name"=${claim.name} AND "state"='RUNNING' AND "leaseToken"=${claim.leaseToken} AND "leaseOwner"=${claim.leaseOwner} AND "leaseUntil">${now}`;
      if (!changed) return false;
      await tx.$executeRaw`UPDATE "BackgroundJobRun" SET "leaseUntil"=${until} WHERE "id"=${claim.leaseToken} AND "state"='RUNNING'`;
      return true;
    });
  }
  async finish(claim: JobClaim, now: Date, error?: unknown): Promise<boolean> {
    const code = error === undefined ? null : safeJobErrorCode(error);
    const next = new Date(now.getTime() + (code ? jobBackoffMs(claim.attempts) : claim.intervalMs));
    const state: JobState = code && claim.attempts >= claim.maxAttempts ? 'DEAD' : 'READY';
    return this.db.$transaction(async tx => {
      const changed = await tx.$executeRaw`UPDATE "BackgroundJob" SET "state"=${state},"attempts"=${code ? claim.attempts : 0},"nextRunAt"=${next},"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastFinishedAt"=${now},"lastSuccessAt"=CASE WHEN ${code}::text IS NULL THEN ${now} ELSE "lastSuccessAt" END,"lastErrorCode"=${code},"updatedAt"=${now} WHERE "name"=${claim.name} AND "state"='RUNNING' AND "leaseToken"=${claim.leaseToken} AND "leaseOwner"=${claim.leaseOwner} AND "leaseUntil">${now}`;
      if (!changed) return false;
      await tx.$executeRaw`UPDATE "BackgroundJobRun" SET "state"=${code ? 'FAILED' : 'SUCCEEDED'},"finishedAt"=${now},"errorCode"=${code} WHERE "id"=${claim.leaseToken} AND "state"='RUNNING'`;
      return true;
    });
  }
  async list(): Promise<JobRecord[]> {
    return this.db.$queryRaw<JobRecord[]>`SELECT "name","state","intervalMs","maxAttempts","attempts","nextRunAt","leaseUntil","lastStartedAt","lastFinishedAt","lastSuccessAt","lastErrorCode","recoveryCount" FROM "BackgroundJob" ORDER BY "name" LIMIT 100`;
  }
  async runs(name: string) {
    return this.db.$queryRaw<{id:string;state:string;startedAt:Date;finishedAt:Date|null;errorCode:string|null;recovered:boolean}[]>`SELECT "id","state","startedAt","finishedAt","errorCode","recovered" FROM "BackgroundJobRun" WHERE "jobName"=${name} ORDER BY "startedAt" DESC LIMIT 30`;
  }
  async retry(name: string, actorId: string, reason: string, now: Date): Promise<boolean> {
    if (!NAME.test(name) || reason.trim().length < 8 || reason.length > 300 || /[\u0000-\u001f]/.test(reason)) throw new AppError(400, 'BAD_JOB_RECOVERY', 'Provide a background job and an 8–300 character recovery reason.');
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<JobRecord[]>`SELECT * FROM "BackgroundJob" WHERE "name"=${name} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Background job not found.');
      if (row.state === 'RUNNING' && row.leaseUntil && row.leaseUntil > now) throw new AppError(409, 'JOB_RUNNING', 'This job still has an active worker. Wait for completion or lease expiry.');
      if (row.state === 'READY' && row.attempts === 0 && row.nextRunAt <= now) return false;
      await tx.$executeRaw`UPDATE "BackgroundJobRun" SET "state"='ABANDONED',"finishedAt"=${now},"errorCode"='OPERATOR_RECOVERY' WHERE "jobName"=${name} AND "state"='RUNNING'`;
      await tx.$executeRaw`UPDATE "BackgroundJob" SET "state"='READY',"attempts"=0,"nextRunAt"=${now},"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastErrorCode"=NULL,"updatedAt"=${now} WHERE "name"=${name}`;
      await tx.adminAuditLog.create({data:{action:'BACKGROUND_JOB_RETRY',targetType:'BACKGROUND_JOB',targetId:name,summary:`Operator ${actorId}: ${reason.trim()}`}});
      return true;
    });
  }
  async prune(now: Date) {
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    // Failed/dead work remains until an operator resolves it; successful historical runs are bounded.
    return this.db.$executeRaw`DELETE FROM "BackgroundJobRun" WHERE "state"='SUCCEEDED' AND "finishedAt"<${cutoff}`;
  }
}

export class DurableJobWorker {
  readonly workerId: string;
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private initialized = false;
  private controllers = new Set<AbortController>();
  private scheduled = new Map<string, Promise<void>>();
  private polling: Promise<void> | undefined;
  constructor(private readonly specs: JobSpec[], private readonly store = new JobStore(), private readonly clock = () => new Date(), workerId: string = randomUUID()) {
    this.workerId = workerId;
    const names = new Set<string>();
    for (const spec of specs) { validate(spec); if (names.has(spec.name)) throw new Error('Duplicate background job name.'); names.add(spec.name); }
  }
  async initialize() { for (const spec of this.specs) await this.store.register(spec, this.clock()); this.initialized = true; }
  /** One serial lane per instance, shared PostgreSQL claims across instances. A slow job cannot stack repeated timer ticks. */
  runDue(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    return this.running ??= this.cycle().finally(() => { this.running = null; });
  }
  private async cycle() {
    // A temporarily unavailable database at boot is retried by the next poll.
    if (!this.initialized) await this.initialize();
    for (const spec of this.specs) {
      if (this.stopped) return;
      const claim = await this.store.claim(spec, this.workerId, this.clock());
      if (!claim) continue;
      await this.execute(spec, claim);
    }
  }
  /** Runtime polling never waits for provider I/O: at most two independently leased
   * jobs run locally and a completed dispatch scan may be claimed again while a
   * slow refund batch is still running. PostgreSQL owns cross-instance exclusion. */
  private async pollDue() {
    if (this.stopped) return;
    if (!this.initialized) await this.initialize();
    for (const spec of this.specs) {
      if (this.stopped || this.scheduled.size >= 2) return;
      if (this.scheduled.has(spec.name)) continue;
      const claim=await this.store.claim(spec,this.workerId,this.clock());
      if(!claim)continue;
      const execution=this.execute(spec,claim).finally(()=>{this.scheduled.delete(spec.name);});
      this.scheduled.set(spec.name,execution);
    }
  }
  private async execute(spec: JobSpec, claim: JobClaim) {
    const controller = new AbortController(); this.controllers.add(controller);
    const leaseMs = spec.leaseMs ?? DEFAULT_LEASE_MS;
    let heartbeat: Promise<void> | undefined;
    const checkpoint = async () => {
      if (controller.signal.aborted) throw new JobAborted();
      if (!await this.store.heartbeat(claim, leaseMs, this.clock())) { controller.abort(); throw new JobLeaseLost(); }
      if (controller.signal.aborted) throw new JobAborted();
    };
    const interval = setInterval(() => {
      if (heartbeat || controller.signal.aborted) return;
      heartbeat = checkpoint().catch(() => { controller.abort(); }).finally(() => { heartbeat = undefined; });
    }, Math.min(20_000, Math.max(250, Math.floor(leaseMs / 3))));
    interval.unref();
    const deadline = setTimeout(() => controller.abort(), spec.maxRuntimeMs ?? DEFAULT_RUNTIME_MS); deadline.unref();
    try {
      await checkpoint();
      await spec.handler({ now: this.clock(), signal: controller.signal, checkpoint });
      if (controller.signal.aborted) throw new JobAborted();
      if (!await this.store.finish(claim, this.clock())) console.warn(`Background job ${spec.name} lost ownership before completion.`);
    } catch (error) {
      // Stop before the next resource operation if renewal failed; provider calls already in flight use business idempotency.
      await this.store.finish(claim, this.clock(), error).catch(() => false);
      console.error(`Background job ${spec.name} failed (${safeJobErrorCode(error)}).`);
    } finally {
      clearInterval(interval); clearTimeout(deadline); this.controllers.delete(controller);
      await heartbeat?.catch(() => undefined);
    }
  }
  start(pollMs = 5000) {
    if (this.timer) return;
    if (!Number.isInteger(pollMs) || pollMs < 1000 || pollMs > 60_000) throw new Error('Worker polling must be 1–60 seconds.');
    const poll=()=>{
      if(this.polling||this.stopped)return;
      this.polling=this.pollDue().catch(()=>console.error('Background scheduler could not reach its database; next poll will retry.')).finally(()=>{this.polling=undefined;});
    };
    this.timer = setInterval(poll, pollMs);
    this.timer.unref();
    poll();
  }
  /** Cooperative drain: no process claims new jobs after shutdown begins. Existing resource-level leases survive abrupt death. */
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const controller of this.controllers) controller.abort();
    await this.polling;
    await this.running;
    await Promise.allSettled([...this.scheduled.values()]);
  }
}
