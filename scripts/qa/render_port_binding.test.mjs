// Run after `npm run build` in backend. Uses the compiled API, no database or secrets.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(new URL('../../backend/dist/index.js', import.meta.url));

function start(t, port) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'grozo-port-test-'));
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: {
      PATH: process.env.PATH, NODE_ENV: 'test', AUTH_MODE: 'legacy', PORT: String(port),
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/grozo_port_test',
      JWT_SECRET: 'isolated-port-test-secret-at-least-32-characters',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    rmSync(cwd, { recursive: true, force: true });
  });
  return { child, output: () => output };
}

test('compiled API accepts container IPv4 HTTP traffic and keeps admin auth enforced', { timeout: 15000 }, async t => {
  const probe = http.createServer();
  probe.listen(0, '0.0.0.0');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const { child, output } = start(t, port);
  await new Promise((resolve, reject) => {
    child.stdout.on('data', () => {
      if (output().includes(`listening on http://0.0.0.0:${port}`)) resolve();
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`API exited ${code}: ${output()}`)));
  });
  const external = Object.values(networkInterfaces()).flat()
    .find(item => item.family === 'IPv4' && !item.internal);
  assert.ok(external, 'A container IPv4 interface is required for this integration check.');
  for (const host of ['127.0.0.1', external.address]) {
    const health = await fetch(`http://${host}:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'online');
  }
  const denied = await fetch(`http://${external.address}:${port}/api/admin/partners`);
  assert.equal(denied.status, 401);
});

test('invalid Render PORT fails startup instead of selecting a pipe or random port', { timeout: 10000 }, async t => {
  const { child, output } = start(t, 'not-a-port');
  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0);
  assert.match(output(), /PORT must be an integer between 1 and 65535/);
  assert.doesNotMatch(output(), /Backend Engine listening/);
});
