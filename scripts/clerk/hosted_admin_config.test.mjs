import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const tool=new URL('../configure_hosted_admin.mjs',import.meta.url);
const key='pk_test_'+Buffer.from('synthetic-config.clerk.accounts.dev$').toString('base64');
function run(env,check) {
 const dir=mkdtempSync(join(tmpdir(),'grozo-csp-')),output=join(dir,'vercel.json');
 try { const result=spawnSync(process.execPath,[tool.pathname,'--output',output],{env:{...process.env,GROZO_BACKEND_ORIGIN:'https://synthetic-api.example.test',VITE_CLERK_PUBLISHABLE_KEY:key,...env},encoding:'utf8'});check(result,output); }
 finally { rmSync(dir,{recursive:true,force:true}); }
}
test('Clerk CSP grants only exact trusted origins and preserves SPA refresh/security headers',()=>{
 run({},(result,output)=>{
  assert.equal(result.status,0,result.stderr);const config=JSON.parse(readFileSync(output));
  const headers=config.headers[0].headers,csp=headers.find(h=>h.key==='Content-Security-Policy').value;
  assert.ok(csp.includes('https://synthetic-config.clerk.accounts.dev'));
  assert.ok(csp.includes('https://synthetic-api.example.test wss://synthetic-api.example.test'));
  assert.ok(csp.includes('https://challenges.cloudflare.com'));
  assert.ok(!csp.includes('*'));assert.ok(!/https:\s/.test(csp));
  assert.ok(csp.includes("frame-ancestors 'none'"));assert.ok(csp.includes("object-src 'none'"));
  assert.deepEqual(config.rewrites,[{source:'/(.*)',destination:'/index.html'}]);
 });
});
test('reject insecure or wildcard backend origins and invalid Clerk keys',()=>{
 for(const origin of ['http://api.example.test','https://*.example.test','https://user:password@api.example.test','https://api.example.test?next=1'])
  run({GROZO_BACKEND_ORIGIN:origin},result=>assert.notEqual(result.status,0));
 run({VITE_CLERK_PUBLISHABLE_KEY:'invalid-key'},result=>assert.notEqual(result.status,0));
});
test('external product imagery needs individually configured HTTPS origins',()=>{
 run({GROZO_PRODUCT_IMAGE_ORIGINS:'https://images.example.test'},(result,output)=>{
  assert.equal(result.status,0);assert.ok(readFileSync(output,'utf8').includes('https://images.example.test'));
 });
});
