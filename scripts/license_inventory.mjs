#!/usr/bin/env node
// Lockfile metadata inventory, not a substitute for reviewing distributed license texts/assets.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const inventory = [];
for (const component of ['backend', 'web/super_admin', 'web/landing']) {
  const lock = JSON.parse(readFileSync(path.join(root, component, 'package-lock.json'), 'utf8'));
  for (const [location, pkg] of Object.entries(lock.packages)) {
    if (!location || pkg.link) continue;
    inventory.push({ component, name: location.split('node_modules/').at(-1), version: pkg.version, license: pkg.license || 'REVIEW_REQUIRED', development: Boolean(pkg.dev), optional: Boolean(pkg.optional) });
  }
}
mkdirSync(path.join(root, 'Docs/evidence'), { recursive: true });
writeFileSync(path.join(root, 'Docs/evidence/node-licenses.json'), JSON.stringify(inventory, null, 2) + '\n');
const counts = {};
for (const item of inventory) counts[item.license] = (counts[item.license] || 0) + 1;
console.log(JSON.stringify({ packages: inventory.length, licenses: counts }, null, 2));
