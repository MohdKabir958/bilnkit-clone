/** Log only operator-safe database diagnostics, never Prisma's raw message or URL. */
export function databaseReadinessDiagnostic(error: unknown, databaseUrl?: string) {
  const value = error && typeof error === 'object' ? error as {code?: unknown; errorCode?: unknown} : {};
  const code = [value.code, value.errorCode].find((v): v is string => typeof v === 'string' && /^P\d{4}$/.test(v)) ?? 'UNKNOWN';
  let host = 'unavailable';
  try {
    const url = new URL(databaseUrl ?? '');
    if (['postgres:', 'postgresql:'].includes(url.protocol)) host = url.hostname;
  } catch { /* malformed URLs must not be echoed into logs */ }
  const hints: Record<string, string> = {
    P1000: 'Database credentials rejected. Copy the current Neon credentials into DATABASE_URL.',
    P1001: 'Database host unreachable. Check the Neon hostname, active endpoint and network access.',
    P1002: 'Database connection timed out. Check endpoint availability and connection timeout.',
    P1011: 'Database TLS failed. Check the Neon TLS connection settings.',
    P1013: 'Database URL is invalid. Copy the complete URL directly from Neon.',
    P2024: 'Database connection pool timed out. Check pool limits and database availability.',
  };
  return {code, host, hint:hints[code] ?? 'Database query failed. Check the server database configuration and Prisma engine setup.'};
}

import { Prisma, PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { DeploymentEnv } from '../config/deploymentContract';

export class RuntimeReadinessError extends Error {
  constructor(public readonly code: 'SCHEMA_NOT_READY' | 'UPLOAD_UNAVAILABLE', cause?: unknown) {
    super(code === 'SCHEMA_NOT_READY' ? 'Database schema is not ready for this release.' : 'Configured upload storage is not writable.');
    this.name = 'RuntimeReadinessError';
    // Never attach the raw database error (Prisma messages can contain credentials/arguments).
    void cause;
  }
}

/** A reachable empty/wrong database must never pass readiness. No business rows are read. */
export async function runtimeReadiness(db: Pick<PrismaClient, '$queryRaw'>, env: DeploymentEnv = process.env): Promise<{ ready: true; schemaReady: true; uploadWritable: true }> {
  try {
    await db.$queryRaw(Prisma.sql`SELECT "id", "clerkUserId" FROM "User" LIMIT 0`);
    await db.$queryRaw(Prisma.sql`SELECT "id", "workflowVersion", "estimatedReadyAt" FROM "Order" LIMIT 0`);
    await db.$queryRaw(Prisma.sql`SELECT "id", "stockQty", "stockVersion", "batchTracking" FROM "MenuItem" LIMIT 0`);
    await db.$queryRaw(Prisma.sql`SELECT "id", "preparationMinutes" FROM "Vendor" LIMIT 0`);
    await db.$queryRaw(Prisma.sql`SELECT "name", "leaseToken" FROM "BackgroundJob" LIMIT 0`);
    await db.$queryRaw(Prisma.sql`SELECT "id", "state" FROM "PaymentRefund" LIMIT 0`);
    await db.$queryRaw(Prisma.sql`SELECT "id", "storageKey" FROM "SupportEvidence" LIMIT 0`);
    const migration = await db.$queryRaw<{ unfinished: bigint }[]>(Prisma.sql`SELECT count(*) AS unfinished FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
    if (Number(migration[0]?.unfinished ?? 1) !== 0) throw new RuntimeReadinessError('SCHEMA_NOT_READY');
  } catch (error) { throw new RuntimeReadinessError('SCHEMA_NOT_READY', error); }
  const directory = path.resolve(env.UPLOAD_DIR || './var/uploads');
  const probe = path.join(directory, `.readiness-${randomUUID()}`);
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o750 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid upload directory.');
    await fs.writeFile(probe, 'ready', { flag: 'wx', mode: 0o600 });
  } catch (error) { throw new RuntimeReadinessError('UPLOAD_UNAVAILABLE', error); }
  finally { await fs.unlink(probe).catch(() => undefined); }
  return { ready: true, schemaReady: true, uploadWritable: true };
}
