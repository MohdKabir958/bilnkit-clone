#!/usr/bin/env node
// Neon: direct connection for migrations, pooler for application traffic.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const selectedKey = process.env.MIGRATION_DATABASE_URL ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL';
const selected = process.env[selectedKey];
try {
  const url = new URL(selected || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
} catch {
  console.error(`${selectedKey} must be a complete postgresql:// connection URL. Copy it directly from Neon without quotes or a psql command.`);
  process.exit(1);
}
// Log only the selected setting and hostname; never user/password or the URL.
console.log(`Migration connection: ${selectedKey}, host ${new URL(selected).hostname}`);
const result = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
  cwd: root, env: { ...process.env, DATABASE_URL: selected }, stdio: 'inherit',
});
if (result.error) console.error('The migration process could not start.');
process.exit(result.status ?? 1);
