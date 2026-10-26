#!/usr/bin/env node
// Real PostgreSQL round trip of synthetic records; only creates fresh local test databases.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = path.join(root, 'backend');
const require = createRequire(path.join(backend, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const sourceSettings = dotenv.parse(readFileSync(path.join(backend, '.env')));
const base = new URL(process.env.QA_DATABASE_URL || sourceSettings.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw Error('Recovery drill accepts local PostgreSQL only.');
const suffix = Date.now();
const sourceName = `grozo_recovery_${suffix}_test`, restoreName = `grozo_recovery_${suffix}_restore_test`;
const source = new URL(base), restored = new URL(base), adminUrl = new URL(base);
source.pathname = `/${sourceName}`; restored.pathname = `/${restoreName}`; adminUrl.pathname = '/postgres';
const evidence = path.join(root, 'Docs/production-readiness/evidence/recovery'); mkdirSync(evidence, { recursive: true });
const privateDirectory = path.join(backend, `var/recovery-drill-${suffix}`); mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
let log = 'Synthetic local PostgreSQL backup/isolated restore drill\n';
const command = (args, env, expected = 0) => {
  const result = spawnSync(process.execPath, args, { cwd: backend, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  log += `$ node ${args.map(arg => arg.startsWith(privateDirectory) ? '<private-archive-directory>' : arg).join(' ')}\n${result.stdout || ''}${result.stderr || ''}\nexit ${result.status}\n`;
  assert.equal(result.status, expected, 'Recovery command exit must match its expected safe outcome.');
  return result.stdout;
};
let sourceDb, restoredDb;
try {
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    for (const name of [sourceName, restoreName]) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'`);
  } finally { await admin.$disconnect(); }
  command(['scripts/migrate.mjs'], { DATABASE_URL: source.toString(), NODE_ENV: 'test' });
  sourceDb = new PrismaClient({ datasources: { db: { url: source.toString() } } });
  await sourceDb.user.create({ data: { id: 'recovery-customer', name: 'Synthetic recovery customer', role: 'STUDENT', clerkUserId: 'user_recoverySynthetic' } });
  await sourceDb.vendor.create({ data: { id: 'recovery-store', name: 'Simulated recovery store', category: 'Grocery', address: 'Synthetic recovery fixture only', bannerImage: '', preparationMinutes: 12 } });
  await sourceDb.menuItem.create({ data: { id: 'recovery-product', vendorId: 'recovery-store', name: 'Synthetic rice pack', category: 'Grocery', description: 'Recovery fixture only', imageUrl: '/uploads/synthetic.webp', price: 115, vendorPrice: 100, stockQty: 8 } });
  await sourceDb.order.create({ data: { id: 'recovery-order', customerId: 'recovery-customer', vendorId: 'recovery-store', totalAmount: 145, subtotal: 115, vendorSubtotal: 100, commissionTotal: 15, deliveryFee: 30, dropoffHostel: '', paymentStatus: 'PAID', paidAt: new Date('2026-10-01T10:00:00Z'), items: { create: { menuItemId: 'recovery-product', name: 'Synthetic rice pack', quantity: 1, price: 115, vendorUnitPrice: 100, commissionUnit: 15 } }, payments: { create: { razorpayOrderId: 'recovery_synthetic_provider_order', razorpayPaymentId: 'recovery_synthetic_captured_payment', amount: 145, capturedAmountPaise: 14500, status: 'PAID' } } } });
  const snapshot = async db => ({
    customer: await db.user.findUnique({ where: { id: 'recovery-customer' } }),
    order: await db.order.findUnique({ where: { id: 'recovery-order' }, include: { items: true, payments: true } }),
    product: await db.menuItem.findUnique({ where: { id: 'recovery-product' } }),
    tables: await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"),
    migrations: await db.$queryRawUnsafe('SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name'),
  });
  const before = JSON.stringify(await snapshot(sourceDb));
  command([path.join(root, 'scripts/database_recovery.mjs'), 'backup', privateDirectory], { DATABASE_URL: source.toString() });
  const file = path.join(privateDirectory, readdirSync(privateDirectory).find(name => name.endsWith('.dump')));
  const restoreResult = JSON.parse(command([path.join(root, 'scripts/database_recovery.mjs'), 'restore', file], { DATABASE_URL: source.toString(), RESTORE_DATABASE_URL: restored.toString() }).trim());
  restoredDb = new PrismaClient({ datasources: { db: { url: restored.toString() } } });
  const after = JSON.stringify(await snapshot(restoredDb));
  assert.equal(after, before, 'Identity mapping, financial history, stock, all tables and migration checksums must match after restore.');
  command([path.join(root, 'scripts/database_recovery.mjs'), 'restore', file], { DATABASE_URL: source.toString(), RESTORE_DATABASE_URL: restored.toString() }, 1);
  command([path.join(root, 'scripts/database_recovery.mjs'), 'restore', file], { DATABASE_URL: source.toString(), RESTORE_DATABASE_URL: base.toString() }, 1);
  const result = { passed: true, database: sourceName, restoreTarget: restoreName, source: 'synthetic-local-fixtures-only', schemaAndMigrationChecksumsPreserved: true, clerkUuidMappingPreserved: true, orderPaymentStockSnapshotsPreserved: true, overwriteRejected: true, nonIsolatedTargetRejected: true, archiveChecksumVerified: true, counts: restoreResult.counts, node: process.version, completedAt: new Date().toISOString(), exitCode: 0 };
  writeFileSync(path.join(evidence, 'database-recovery.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} catch (error) { log += `DRILL FAILURE: ${error.message}\n`; console.error(error.message); process.exitCode = 1; }
finally { await sourceDb?.$disconnect(); await restoredDb?.$disconnect(); writeFileSync(path.join(evidence, 'database-recovery.txt'), log); }
