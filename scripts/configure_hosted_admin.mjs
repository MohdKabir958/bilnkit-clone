#!/usr/bin/env node
// Run before Vercel reads its deployment configuration.
import { writeFileSync } from 'node:fs';

function httpsOrigin(value, name) {
  let url;
  try { url = new URL(value || ''); } catch { throw new Error(`${name} must be an HTTPS origin.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name} must be an HTTPS origin without credentials, paths, queries or fragments.`);
  }
  return url.origin;
}

try {
  const api = httpsOrigin(process.env.GROZO_BACKEND_ORIGIN, 'GROZO_BACKEND_ORIGIN');
  const socket = api.replace(/^https:/, 'wss:');
  const csp = [
    "default-src 'self'", `connect-src 'self' ${api} ${socket}`,
    "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'",
    "img-src 'self' data: https:", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
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
  writeFileSync(new URL('../web/super_admin/vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
  console.log('Vercel CSP configured for the supplied backend HTTPS/WSS origin.');
  console.log('Set VITE_API_BASE_URL and VITE_SOCKET_URL to that origin in Vercel, then rebuild.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
