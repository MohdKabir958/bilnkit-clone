#!/usr/bin/env node
// The inherited migration history starts with legacy ALTERs before its CREATEs.
// Bootstrap only an empty public schema, preserving every historical checksum.
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const prisma = new PrismaClient();
const cli = path.join(root, 'node_modules/prisma/build/index.js');
function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Prisma ${args[0]} failed. Resolve the migration error before retrying.`);
}

try {
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (databaseUrl.searchParams.has('schema') && databaseUrl.searchParams.get('schema') !== 'public') {
    throw new Error('This bootstrap supports the public schema only. Review custom-schema migrations manually.');
  }
  const objects = await prisma.$queryRaw`
    SELECT relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    UNION ALL SELECT typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
  `;
  if (objects.length === 0) {
    const manifest = JSON.parse(readFileSync(path.join(root, 'prisma/baseline/manifest.json'), 'utf8'));
    for (const entry of manifest) {
      const sql = readFileSync(path.join(root, 'prisma/migrations', entry.name, 'migration.sql'));
      if (createHash('sha256').update(sql).digest('hex') !== entry.sha256) {
        throw new Error(`Historical migration changed: ${entry.name}. Refusing automatic bootstrap.`);
      }
    }
    console.log('Empty database: applying the audited schema baseline. No existing data will be changed.');
    run('db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/baseline/schema.sql');
    for (const entry of manifest) run('migrate', 'resolve', '--applied', entry.name);
  } else if (!objects.some((o) => o.name === '_prisma_migrations')) {
    throw new Error('Existing untracked schema detected. Back up, compare and baseline it manually; automatic bootstrap is only for empty databases.');
  }
  run('migrate', 'deploy');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
