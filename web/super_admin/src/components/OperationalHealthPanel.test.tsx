// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {apiService} from '../services/api';
import {OperationalHealthPanel} from './OperationalHealthPanel';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;const auth=vi.fn();
const click=async(label:string)=>act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent===label)!.click();});
const open=()=>act(async()=>{host.querySelector('details')!.open=true;host.querySelector('details')!.dispatchEvent(new Event('toggle'));});
beforeEach(async()=>{
 vi.spyOn(apiService,'backgroundJobs').mockResolvedValue([{name:'notification-outbox',state:'DEAD',attempts:8,maxAttempts:8,lastErrorCode:'TRANSPORT_TIMEOUT'}]);
 vi.spyOn(apiService,'complianceReminders').mockResolvedValue([{vendorId:'store-a',businessName:'Synthetic Grocery',fssaiExpiresAt:'2020-01-01T00:00:00Z',status:'APPROVED'}]);
 vi.spyOn(apiService,'backgroundJobRuns').mockResolvedValue([{id:'run-a',state:'FAILED',startedAt:'2026-10-26T00:00:00Z',errorCode:'TRANSPORT_TIMEOUT'}]);
 vi.spyOn(apiService,'retryBackgroundJob').mockResolvedValue({});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);await act(async()=>root.render(<OperationalHealthPanel onAuthError={auth}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.clearAllMocks();});
it('loads real job and reminder responses only when opened and distinguishes expiry from approval',async()=>{
 expect(apiService.backgroundJobs).not.toHaveBeenCalled();await open();expect(apiService.backgroundJobs).toHaveBeenCalled();
 expect(host.textContent).toContain('notification-outbox · DEAD');expect(host.textContent).toContain('Synthetic Grocery');expect(host.textContent).toContain('Expired');expect(host.textContent).toContain('does not renew a licence or change approval');
});
it('requires an investigation reason and submits an explicit recovery request, never financial success',async()=>{
 await open();await click('Inspect notification-outbox');expect(host.textContent).toContain('TRANSPORT_TIMEOUT');
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Request safe job retry')!;expect(button.disabled).toBe(true);
 await act(async()=>{const input=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Provider recovered; checked retry safety');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(button.disabled).toBe(false);await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(apiService.retryBackgroundJob).toHaveBeenCalledWith('notification-outbox','Provider recovered; checked retry safety');expect(host.textContent).toContain('not confirmation of a payment or refund');
});
it('cannot duplicate a running worker and exposes failed diagnostics without claiming completion',async()=>{
 vi.mocked(apiService.backgroundJobs).mockResolvedValue([{name:'busy',state:'RUNNING',attempts:1,maxAttempts:8}]);await open();await click('Inspect busy');
 await act(async()=>{const input=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Checked this active worker safely');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Request safe job retry')!.disabled).toBe(true);
 vi.mocked(apiService.backgroundJobs).mockRejectedValue(new Error('Session expired'));await click('Refresh operational health');expect(auth).toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toContain('Session expired');
});
