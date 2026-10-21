import assert from 'node:assert/strict';
import test from 'node:test';
import { assertHostedAuthConfig } from '../../web/super_admin/scripts/check-hosted-auth.mjs';

const instance = 'synthetic.clerk.accounts.dev';
const api = 'https://api.example.test';
const key = host => 'pk_test_' + Buffer.from(`${host}$`).toString('base64');
const env = {VITE_AUTH_MODE:'clerk-test',VITE_CLERK_PUBLISHABLE_KEY:key(instance),VITE_API_BASE_URL:api,VITE_SOCKET_URL:api};
const config = (clerk = instance, extra = '') => ({headers:[{source:'/(.*)',headers:[{key:'Content-Security-Policy',value:`default-src 'self'; script-src 'self' https://${clerk}; worker-src 'self' blob:; connect-src 'self' https://${clerk} ${api} wss://api.example.test ${extra}; frame-src https://${clerk}`}]}]});

test('matching Clerk instance and API/socket origins pass',()=>assert.doesNotThrow(()=>assertHostedAuthConfig(env,config())));
test('another instance key reproduces the deployed script blocking failure at build time',()=>{
  assert.throws(()=>assertHostedAuthConfig({...env,VITE_CLERK_PUBLISHABLE_KEY:key('other.clerk.accounts.dev')},config()),/Clerk CSP mismatch: script-src-elem/);
});
test('missing socket transport and explicit script-src-elem cannot hide a mismatch',()=>{
  const missingSocket=config();missingSocket.headers[0].headers[0].value=missingSocket.headers[0].headers[0].value.replace('wss://api.example.test','');
  assert.throws(()=>assertHostedAuthConfig(env,missingSocket),/VITE_SOCKET_URL is blocked/);
  const wrongScript=config();wrongScript.headers[0].headers[0].value+="; script-src-elem 'self'";
  assert.throws(()=>assertHostedAuthConfig(env,wrongScript),/script-src-elem/);
});
test('wildcards, wrong key modes and insecure backend origins are refused',()=>{
  assert.throws(()=>assertHostedAuthConfig(env,config(instance,'*')),/exact trusted origins/);
  assert.throws(()=>assertHostedAuthConfig({...env,VITE_AUTH_MODE:'clerk'},config()),/does not match/);
  assert.throws(()=>assertHostedAuthConfig({...env,VITE_API_BASE_URL:'http://api.example.test'},config()),/HTTPS origin/);
});
test('legacy builds do not require Clerk configuration',()=>assert.doesNotThrow(()=>assertHostedAuthConfig({},{})));
test('missing blob worker permission fails before publishing a broken Clerk build',()=>{
  const blocked=config();blocked.headers[0].headers[0].value=blocked.headers[0].headers[0].value.replace("worker-src 'self' blob:;",'');
  assert.throws(()=>assertHostedAuthConfig(env,blocked),/Clerk requires worker-src/);
});
