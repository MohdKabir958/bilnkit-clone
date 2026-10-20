#!/usr/bin/env node
// Render supplies its actual HTTPS URL. Existing production checks still apply.
if (!process.env.PUBLIC_BASE_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.PUBLIC_BASE_URL = process.env.RENDER_EXTERNAL_URL;
}
await import('../dist/index.js');
