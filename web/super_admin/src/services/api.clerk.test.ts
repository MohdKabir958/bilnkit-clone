// @vitest-environment jsdom
// Explicit HTTP/SDK fixtures; not a real identity or permission verification test.
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
let api:typeof import('./api');
beforeEach(async()=>{
  vi.resetModules();vi.stubEnv('VITE_AUTH_MODE','clerk-test');localStorage.clear();
  api=await import('./api');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:true,user:{id:'internal-admin',name:'Synthetic Admin',role:'ADMIN'}}),{status:200,headers:{'Content-Type':'application/json'}})));
});
afterEach(()=>{api.installClerkTokenGetter(null);vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('uses a fresh SDK bearer for each cross-origin request and ignores the old stored token',async()=>{
  localStorage.setItem('kraveo_admin_token','old-token-must-not-be-used');
  const getter=vi.fn().mockResolvedValueOnce('sdk-fixture-A').mockResolvedValueOnce('sdk-fixture-B');api.installClerkTokenGetter(getter);
  await api.apiService.validateSession();await api.apiService.validateSession();
  const calls=vi.mocked(fetch).mock.calls;
  expect((calls[0][1]!.headers as Record<string,string>).Authorization).toBe('Bearer sdk-fixture-A');
  expect((calls[1][1]!.headers as Record<string,string>).Authorization).toBe('Bearer sdk-fixture-B');
  expect(localStorage.getItem('kraveo_admin_token')).toBe('old-token-must-not-be-used'); // SDK tokens never written here.
});
it('missing SDK session returns 401 without using legacy localStorage credentials',async()=>{
  localStorage.setItem('kraveo_admin_token','old-token');api.installClerkTokenGetter(async()=>null);
  await expect(api.apiService.validateSession()).rejects.toMatchObject({status:401});expect(fetch).not.toHaveBeenCalled();
});
it('SDK outage reports 503 and cannot fall back to legacy credentials',async()=>{
  api.installClerkTokenGetter(async()=>{throw Error('fixture offline');});
  await expect(api.apiService.validateSession()).rejects.toMatchObject({status:503});expect(fetch).not.toHaveBeenCalled();
});
it('manual custom JWT persistence is disabled in Clerk mode',()=>{expect(()=>api.setAuthToken('anything')).toThrow();expect(api.getAuthToken()).toBe('');});
it('a customer profile cannot pass the client admin check',async()=>{
  api.installClerkTokenGetter(async()=>'fixture-only');
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({success:true,user:{id:'customer',role:'STUDENT'}}),{status:200}));
  await expect(api.apiService.validateSession()).rejects.toMatchObject({status:403});
});
