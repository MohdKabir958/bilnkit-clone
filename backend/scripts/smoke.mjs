#!/usr/bin/env node
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const base = process.env.API_URL || 'http://127.0.0.1:5000';
assert(process.env.ADMIN_PASSCODE, 'Configure ADMIN_PASSCODE securely before the runtime smoke check.');
const health = await fetch(`${base}/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).status, 'online');
const denied = await fetch(`${base}/api/admin/partners`);
assert.equal(denied.status, 401);
const login = await fetch(`${base}/api/auth/admin-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ passcode: process.env.ADMIN_PASSCODE }),
});
assert.equal(login.status, 200, 'Admin login failed (token/credentials are never printed).');
const session = await login.json();
assert.equal(typeof session.token, 'string');
const partners = await fetch(`${base}/api/admin/partners`, { headers: { Authorization: `Bearer ${session.token}` } });
assert.equal(partners.status, 200);
assert(Array.isArray((await partners.json()).data));
const vendors = await fetch(`${base}/api/vendors`);
assert.equal(vendors.status, 200);
assert(Array.isArray((await vendors.json()).data));
const geography = await fetch(`${base}/api/v1/admin/geography`, { headers: { Authorization: `Bearer ${session.token}` } });
assert.equal(geography.status, 200);
const geo = (await geography.json()).data;
assert(Array.isArray(geo.cities) && Array.isArray(geo.zones) && Array.isArray(geo.coverage));
const cities = await fetch(`${base}/api/v1/cities`);
assert.equal(cities.status, 200);
assert(Array.isArray((await cities.json()).data));
const inventory = await fetch(`${base}/api/v1/admin/products?limit=1`, { headers: { Authorization: `Bearer ${session.token}` } });
assert.equal(inventory.status, 200);
assert(Array.isArray((await inventory.json()).data));
console.log('PASS: health, admin rejection/login, authenticated partner/geography/inventory queries, public vendor/enabled-city queries.');
