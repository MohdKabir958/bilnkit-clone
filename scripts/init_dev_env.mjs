#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../backend/.env', import.meta.url));
if (existsSync(file)) {
  console.log('backend/.env exists; it was left unchanged.');
} else {
  const database = process.env.DATABASE_URL || 'postgresql://market@127.0.0.1:5432/market_dev';
  if (!/^postgres(?:ql)?:\/\//.test(database) || /[\r\n]/.test(database)) throw new Error('Invalid DATABASE_URL');
  writeFileSync(file, [
    '# Generated for local development only; never commit or reuse in production.',
    'NODE_ENV=development', 'PAYMENT_PROVIDER=disabled', 'PORT=5000',
    `DATABASE_URL=${JSON.stringify(database)}`,
    `JWT_SECRET=${randomBytes(32).toString('hex')}`,
    `ADMIN_PASSCODE=${randomBytes(20).toString('hex')}`,
    'CLIENT_URL=http://localhost:5173', 'ADMIN_URL=http://localhost:3000', '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  console.log('Created backend/.env with unique local authentication secrets. Read it locally to log in; do not paste it in chat. Payments are disabled.');
}
