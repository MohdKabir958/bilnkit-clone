#!/usr/bin/env node
// Run before Vercel reads its deployment configuration.
import { writeFileSync } from 'node:fs';

function httpsOrigin(value, name) {
  let url;
  try { url = new URL(value || ''); } catch { throw new Error(`${name} must be an HTTPS origin.`); }
  if (url.protocol !== 'https:' || url.hostname.includes('*') || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name} must be an HTTPS origin without credentials, paths, queries or fragments.`);
  }
  return url.origin;
}

try {
  const api = httpsOrigin(process.env.GROZO_BACKEND_ORIGIN, 'GROZO_BACKEND_ORIGIN');
  const key = process.env.VITE_CLERK_PUBLISHABLE_KEY || '';
  const encoded = key.replace(/^pk_(test|live)_/, '');
  const decoded = key ? Buffer.from(encoded, 'base64').toString('ascii') : '';
  if (key && (!/^pk_(test|live)_/.test(key) || !/^[A-Za-z0-9+/=_-]+$/.test(encoded) || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\$$/.test(decoded))) throw new Error('Invalid Clerk publishable key.');
  const clerk = key ? httpsOrigin('https://' + decoded.slice(0, -1), 'Clerk frontend origin') : '';
  if (key && (!/^pk_(test|live)_/.test(key) || !new URL(clerk).hostname.match(/^[a-z0-9.-]+$/))) throw new Error('Invalid Clerk publishable key.');
  const images = (process.env.GROZO_PRODUCT_IMAGE_ORIGINS || '').split(',').filter(Boolean).map(v => httpsOrigin(v.trim(), 'Product image origin'));
  const socket = api.replace(/^https:/, 'wss:');
  const csp = [
    "default-src 'self'", `connect-src 'self' ${api} ${socket}${clerk ? ` ${clerk} https://clerk-telemetry.com https://challenges.cloudflare.com` : ''}`,
    `script-src 'self'${clerk ? ` ${clerk} https://challenges.cloudflare.com` : ''}`,
    // Clerk uses an app-origin blob worker. Keep blob: out of script-src.
    `worker-src 'self'${clerk ? ' blob:' : ''}`,
    `frame-src${clerk ? ` ${clerk} https://challenges.cloudflare.com` : " 'none'"}`, "style-src 'self' 'unsafe-inline'", "font-src 'self'",
    `img-src 'self' data: ${api}${clerk ? ` ${clerk} https://img.clerk.com` : ''} ${images.join(' ')}`, "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
  ].join('; ');
  const config = {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist',
    headers: [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: csp },
    ] }],
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  };
  if (process.argv.length > 2 && (process.argv[2] !== '--output' || process.argv.length !== 4)) throw new Error('Usage: configure_hosted_admin.mjs [--output PATH]');
  writeFileSync(process.argv[3] || new URL('../web/super_admin/vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
  console.log('Vercel CSP configured for the supplied backend HTTPS/WSS origin.');
  console.log('Set VITE_API_BASE_URL and VITE_SOCKET_URL to that origin in Vercel, then rebuild.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
