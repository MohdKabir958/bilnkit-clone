// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {apiService} from './api';
import {retryDelaySeconds} from '../lib/retryDelay';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it.each(['120','Tue, 27 Oct 2026 00:02:00 GMT'])('honors Retry-After %s without retrying a POST',async header=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'RATE_LIMITED',message:'Wait',field:'email'}),{status:429,headers:{'Retry-After':header,'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
 try{await apiService.checkRiderEligibility('synthetic-rider@example.invalid');throw Error('Expected rejection');}catch(error){expect(retryDelaySeconds(error)).toBe(120);expect(fetcher).toHaveBeenCalledTimes(1);}
});
