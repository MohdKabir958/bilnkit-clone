#!/usr/bin/env node
// pg_dump/pg_restore use PG* environment values; credentials never enter argv or application logs.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function postgresEnvironment(value, name = 'DATABASE_URL') {
  let url;
  try { url = new URL(value || ''); } catch { throw Error(`${name} must be a PostgreSQL URL.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash || url.pathname.length < 2) throw Error(`${name} must be a PostgreSQL URL.`);
  const env = { ...process.env };
  // Do not inherit arbitrary connection/service overrides when checking an isolated restore target.
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGHOSTADDR', 'PGSSLCERT', 'PGSSLKEY', 'PGPASSFILE']) delete env[key];
  const allowedSsl = new Set(['require', 'verify-ca', 'verify-full', 'prefer', 'disable']);
  const sslmode = url.searchParams.get('sslmode') || 'prefer';
  if (!allowedSsl.has(sslmode)) throw Error(`${name} has an unsupported sslmode.`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !['require', 'verify-ca', 'verify-full'].includes(sslmode)) throw Error(`${name} must require TLS for a remote database.`);
  Object.assign(env, { PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: sslmode, PGCONNECT_TIMEOUT: '15' });
  return { url, env };
}

export function validateRestoreTarget(value, source) {
  const target = postgresEnvironment(value, 'RESTORE_DATABASE_URL');
  if (!/^[A-Za-z0-9_]+_restore_test$/.test(target.env.PGDATABASE)) throw Error('Restore target must be a NEW isolated database ending in _restore_test.');
  if (source) {
    const origin = postgresEnvironment(source).env;
    if (origin.PGHOST === target.env.PGHOST && origin.PGPORT === target.env.PGPORT && origin.PGDATABASE === target.env.PGDATABASE) throw Error('Restore source and target must be different databases.');
  }
  return target;
}

function execute(command, args, env, capture = false) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'] });
  if (result.error || result.status !== 0) throw Error(`${command} failed (exit ${result.status ?? 'unavailable'}). Review the database tool locally; no credential-bearing output was emitted.`);
  return result.stdout?.trim() || '';
}
const sha256 = file => new Promise((resolve, reject) => {
  const digest = createHash('sha256'), stream = createReadStream(file);
  stream.on('data', chunk => digest.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(digest.digest('hex')));
});

export async function main(argv = process.argv.slice(2)) {
  process.umask(0o077);
  const [action, input] = argv;
  if (!['backup', 'restore'].includes(action) || !input || argv.length !== 2) throw Error('Usage: database_recovery.mjs backup PRIVATE_DIRECTORY | restore ARCHIVE.dump');
  if (action === 'backup') {
    const { env } = postgresEnvironment(process.env.DATABASE_URL);
    const directory = path.resolve(input); mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `grozo-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
    execute('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', file], env);
    execute('pg_restore', ['--list', file], env, true);
    const digest = await sha256(file);
    writeFileSync(`${file}.sha256`, `${digest}  ${path.basename(file)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ action: 'backup', archive: file, sha256: digest, archiveVerified: true }));
  } else {
    const { env } = validateRestoreTarget(process.env.RESTORE_DATABASE_URL, process.env.DATABASE_URL);
    const file = path.resolve(input);
    if (!statSync(file).isFile()) throw Error('Restore archive must be a regular dump file.');
    const expected = readFileSync(`${file}.sha256`, 'utf8').split(/\s/)[0];
    if (!/^[a-f0-9]{64}$/.test(expected) || expected !== await sha256(file)) throw Error('Archive checksum validation failed.');
    const existing = execute('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"], env, true);
    if (existing !== '0') throw Error('Restore target must be empty. No tables were deleted.');
    execute('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', env.PGDATABASE, file], env);
    const counts = execute('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT json_build_object(\'users\',(SELECT count(*) FROM "User"),\'vendors\',(SELECT count(*) FROM "Vendor"),\'products\',(SELECT count(*) FROM "MenuItem"),\'orders\',(SELECT count(*) FROM "Order"),\'migrations\',(SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL));'], env, true);
    console.log(JSON.stringify({ action: 'restore', target: env.PGDATABASE, checksumVerified: true, counts: JSON.parse(counts) }));
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(error => { console.error(error.message); process.exitCode = 1; });
