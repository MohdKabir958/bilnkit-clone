import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function assertHostedAuthConfig(env, config) {
  const mode = env.VITE_AUTH_MODE || 'legacy';
  if (mode === 'legacy') return;
  if (!['clerk-test', 'clerk'].includes(mode)) throw new Error('Invalid VITE_AUTH_MODE.');
  const key = env.VITE_CLERK_PUBLISHABLE_KEY || '';
  if (!key.startsWith(mode === 'clerk-test' ? 'pk_test_' : 'pk_live_')) throw new Error('Clerk publishable key does not match VITE_AUTH_MODE.');
  const host = Buffer.from(key.replace(/^pk_(test|live)_/, ''), 'base64').toString('ascii');
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\$$/.test(host)) throw new Error('Invalid Clerk publishable key host.');
  const clerkOrigin = `https://${host.slice(0, -1)}`;
  const policy = config.headers?.find(rule => rule.source === '/(.*)')?.headers
    ?.find(header => header.key.toLowerCase() === 'content-security-policy')?.value;
  if (!policy || policy.includes('*')) throw new Error('The admin requires a CSP with exact trusted origins.');
  const directives = new Map(policy.split(';').filter(part => part.trim()).map(part => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  const allows = (directive, origin) => {
    const fallback = directive === 'script-src-elem' ? directives.get('script-src') : undefined;
    return (directives.get(directive) || fallback || directives.get('default-src') || []).includes(origin);
  };
  for (const directive of ['script-src-elem', 'connect-src', 'frame-src']) {
    if (!allows(directive, clerkOrigin)) throw new Error(`Clerk CSP mismatch: ${directive} does not permit ${clerkOrigin}. Run scripts/configure_hosted_admin.mjs with the deployed publishable key and commit vercel.json before deploying.`);
  }
  const workers = directives.get('worker-src') || [];
  if (!workers.includes("'self'") || !workers.includes('blob:')) throw new Error("Clerk requires worker-src 'self' blob: in vercel.json. Regenerate and commit the deployment configuration.");
  for (const name of ['VITE_API_BASE_URL', 'VITE_SOCKET_URL']) {
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`${name} must be the backend HTTPS origin.`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(`${name} must be the backend HTTPS origin without credentials or paths.`);
    for (const origin of name === 'VITE_SOCKET_URL' ? [url.origin, url.origin.replace(/^https:/, 'wss:')] : [url.origin]) {
      if (!allows('connect-src', origin)) throw new Error(`${name} is blocked by vercel.json connect-src. Regenerate and commit the deployment configuration.`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { loadEnv } = await import('vite');
    const env = loadEnv('production', process.cwd(), 'VITE_');
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    assertHostedAuthConfig(env, config);
    console.log('Admin authentication configuration matches the deployment security policy.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
