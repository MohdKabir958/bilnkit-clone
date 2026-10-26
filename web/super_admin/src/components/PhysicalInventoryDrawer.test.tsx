// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {apiService} from '../services/api';
import {PhysicalInventoryDrawer} from './PhysicalInventoryDrawer';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
const button=(text:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)!;
const type=async(label:string,value:string)=>act(async()=>{const input=[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent===label)!.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(async()=>{
 vi.spyOn(apiService,'productBatches').mockResolvedValue({data:[{id:'lot-a',lotCode:'LOT-A',availableQty:3,expiresAt:'2030-01-01T18:30:00Z'}],batchTracking:true,stockVersion:4,nextCursor:null});
 vi.spyOn(apiService,'productReservations').mockResolvedValue([{id:'return-a',orderId:'cancelled-order',state:'AWAITING_INSPECTION',quantity:2,packedQty:2,unusableQty:0,pendingInspectionQty:2}]);
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
 await act(async()=>root.render(<PhysicalInventoryDrawer product={{id:'milk',name:'Fresh milk'}} onClose={()=>{}} onAuthError={()=>{}}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('shows actual lot balances and explicit inspection actions for packed cancellations',()=>{
 expect(document.body.textContent).toContain('LOT-A · 3 available');
 expect(document.body.textContent).toContain('2 awaiting inspection');
 expect(button('RETURN')).toBeTruthy();expect(button('WRITE OFF')).toBeTruthy();
 expect(button('PACK')).toBeUndefined();
});
it('retries an unconfirmed inspection with its same request ID and keeps other writes disabled',async()=>{
 const write=vi.spyOn(apiService,'stockDisposition').mockRejectedValueOnce(Error('Connection lost')).mockResolvedValue({});
 await act(async()=>button('RETURN').click());
 await type('Whole packs inspected','1');await type('Inspection / packing reason','Counted safe sealed pack');
 await act(async()=>button('Record physical outcome').closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(document.body.textContent).toContain('Connection lost');expect(button('Receive lot').disabled).toBe(true);
 await act(async()=>button('Retry unconfirmed change').click());
 expect(write).toHaveBeenCalledTimes(2);expect(write.mock.calls[0]).toEqual(write.mock.calls[1]);
 expect(write.mock.calls[0]).toEqual(['return-a',expect.objectContaining({action:'RETURN',quantity:1,clientRequestId:expect.any(String)})]);
 expect(button('Retry unconfirmed change')).toBeUndefined();
});
