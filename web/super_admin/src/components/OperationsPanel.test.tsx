// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {apiService} from '../services/api';
import {OperationsPanel} from './OperationsPanel';
import {overviewFixture} from '../lib/overviewFixture.testdata';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
(globalThis as any).ResizeObserver=class {observe(){}unobserve(){}disconnect(){}};
let host:HTMLDivElement,root:Root;const open=vi.fn(),auth=vi.fn();
const click=async(label:string)=>act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent===label)!.click();});
beforeEach(async()=>{
 vi.spyOn(apiService,'fetchGeography').mockResolvedValue({cities:[{id:'blr',code:'blr',name:'Bengaluru',state:'Karnataka',active:true}],zones:[],coverage:[]});
 vi.spyOn(apiService,'operations').mockResolvedValue(overviewFixture);
 vi.spyOn(apiService,'dispatchPage').mockResolvedValue({data:[{id:'order-owned',vendor:{name:'Local Store'},status:'ACCEPTED',dispatchRound:2,dispatchNote:'OFFERS_EXHAUSTED',dispatchOffers:[]}],nextCursor:null});
 vi.spyOn(apiService,'supportPage').mockResolvedValue({data:[{id:'case-owned',subject:'Refund request',customer:{name:'Customer'},status:'OPEN',description:'Damaged pack',order:{id:'order-owned',status:'DELIVERED',paymentStatus:'PAID',refundStatus:'NONE'},notes:[]}],nextCursor:null});
 vi.spyOn(apiService,'auditPage').mockResolvedValue({data:[{id:'audit-one',createdAt:new Date().toISOString(),action:'DELIVERY_OFFERED',targetType:'ORDER',summary:'Offered to eligible rider'}],nextCursor:null});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);await act(async()=>root.render(<OperationsPanel onAuthError={auth} onOpenOrder={open}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.clearAllMocks();});
it('renders actual paise metrics, dispatch escalation and audit responses',()=>{expect(host.textContent).toContain('₹650.45');expect(host.textContent).toContain('OFFERS_EXHAUSTED');expect(host.textContent).toContain('DELIVERY_OFFERED');expect(host.textContent).toContain('Damaged pack');});
it('retries through the backend and opens the actual linked order for financial review',async()=>{const retry=vi.spyOn(apiService,'retryDispatch').mockResolvedValue({});await click('Start new offer round');expect(retry).toHaveBeenCalledWith('order-owned');await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Review order'))!.click();});expect(open).toHaveBeenCalledWith('order-owned');});
it('submits a requester-visible reply and handles authentication errors',async()=>{const reply=vi.spyOn(apiService,'replySupport').mockRejectedValue(new Error('Session expired'));const textarea=host.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'Approved after order review.');textarea.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>{textarea.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(reply).toHaveBeenCalledWith('case-owned','Approved after order review.','IN_PROGRESS');expect(auth).toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toContain('Session expired');});

it('a slow previous city response cannot overwrite the currently selected city metrics',async()=>{
 const pending=new Map<string,(value:any)=>void>();vi.mocked(apiService.operations).mockImplementation((city)=>new Promise(resolve=>pending.set(city,resolve)));
 await act(async()=>root.render(<OperationsPanel cityId="first-city" onAuthError={auth} onOpenOrder={open}/>));
 await act(async()=>root.render(<OperationsPanel cityId="second-city" onAuthError={auth} onOpenOrder={open}/>));
 await act(async()=>pending.get('second-city')!({...overviewFixture,orders:22,capturedPaise:2200}));
 expect(host.textContent).toContain('₹22.00');
 await act(async()=>pending.get('first-city')!({...overviewFixture,orders:11,capturedPaise:1100}));
 expect(host.textContent).toContain('₹22.00');expect(host.textContent).not.toContain('₹11.00');
});
