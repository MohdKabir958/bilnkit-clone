import type { DeploymentEnv } from './deploymentContract';

export function parseDatabaseUrl(value: string | undefined, name = 'DATABASE_URL'): URL {
  let url: URL;
  try { url = new URL(value || ''); } catch { throw new Error(`${name} must be a complete PostgreSQL URL.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash) throw new Error(`${name} must be a complete PostgreSQL URL.`);
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') throw new Error(`${name} uses an unsupported schema; review its migration procedure before deployment.`);
  return url;
}
const neon = (url: URL) => url.hostname.endsWith('.neon.tech');
export function databaseConfiguration(env: DeploymentEnv) {
  const runtime = parseDatabaseUrl(env.DATABASE_URL);
  const hosted = env.NODE_ENV === 'production' || env.GROZO_ENV === 'staging';
  const limit = runtime.searchParams.get('connection_limit');
  if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 10)) throw new Error('DATABASE_URL connection_limit must be between 1 and 10 for this deployment.');
  const timeout = runtime.searchParams.get('pool_timeout');
  if (timeout !== null && (!/^\d+$/.test(timeout) || Number(timeout) < 1 || Number(timeout) > 120)) throw new Error('DATABASE_URL pool_timeout must be between 1 and 120 seconds.');
  if (neon(runtime) && !['require', 'verify-full'].includes(runtime.searchParams.get('sslmode') || '')) throw new Error('Neon DATABASE_URL must require PostgreSQL TLS (sslmode=require or verify-full).');
  if (hosted && neon(runtime) && !env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL must be a direct Neon connection for controlled migrations.');
  if (env.MIGRATION_DATABASE_URL) {
    const migration = parseDatabaseUrl(env.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL');
    if (neon(migration)) {
      if (migration.hostname.includes('-pooler.')) throw new Error('MIGRATION_DATABASE_URL must use the Neon direct hostname, without -pooler.');
      if (!['require', 'verify-full'].includes(migration.searchParams.get('sslmode') || '')) throw new Error('Neon MIGRATION_DATABASE_URL must require PostgreSQL TLS.');
    }
    if (runtime.pathname !== migration.pathname) throw new Error('Runtime and migration connections must select the same PostgreSQL database.');
    if (neon(runtime) && (runtime.hostname.replace('-pooler.', '.') !== migration.hostname || runtime.username !== migration.username)) throw new Error('Runtime and migration Neon connections must refer to the same endpoint and role.');
  }
  return { provider: neon(runtime) ? 'neon' : 'postgresql', tlsRequired: ['require', 'verify-full'].includes(runtime.searchParams.get('sslmode') || ''), pooled: runtime.hostname.includes('-pooler.'), connectionLimit: limit === null ? null : Number(limit), directMigrationsConfigured: Boolean(env.MIGRATION_DATABASE_URL) };
}
