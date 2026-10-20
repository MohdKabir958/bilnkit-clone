#!/usr/bin/env node
// Neon: direct connection for migrations, pooler for application traffic.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const selected = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
try {
  const url = new URL(selected || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
} catch {
  console.error('Configure a valid MIGRATION_DATABASE_URL or DATABASE_URL before migration.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
  cwd: root, env: { ...process.env, DATABASE_URL: selected }, stdio: 'inherit',
});
if (result.error) console.error('The migration process could not start.');
process.exit(result.status ?? 1);
