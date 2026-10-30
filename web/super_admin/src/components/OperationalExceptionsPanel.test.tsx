// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {apiService} from '../services/api';
import {OperationalExceptionsPanel} from './OperationalExceptionsPanel';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it('keeps the current issue owner on follow-up and allows choosing a backend-approved administrator',async()=>{
 const queue=vi.spyOn(apiService,'operationExceptions').mockResolvedValue({data:[{key:'SUPPORT_OVERDUE',referenceType:'SUPPORT_CASE',referenceId:'case-a',title:'Overdue help',severity:'HIGH',createdAt:'2026-10-26T00:00:00Z',actions:[],ownerId:'admin-one',resolution:{version:1,state:'ACKNOWLEDGED',ownerId:'admin-one',reason:'Under review'}}]});
 vi.spyOn(apiService,'supportOwners').mockResolvedValue([{id:'admin-one',name:'Current supervisor',email:null},{id:'admin-two',name:'Next supervisor',email:'operator@example.invalid'}]);
 const save=vi.spyOn(apiService,'recordOperationResolution').mockResolvedValue({});
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<OperationalExceptionsPanel onAuthError={vi.fn()} onOpenOrder={vi.fn()}/>));
  await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Acknowledge / escalate')!.click();});
  const owner=[...host.querySelectorAll('select')][1];expect(owner.value).toBe('admin-one');
  await act(async()=>{owner.value='admin-two';owner.dispatchEvent(new Event('change',{bubbles:true}));const reason=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(reason,'Escalated after reviewing the actual case');reason.dispatchEvent(new Event('input',{bubbles:true}));});
  queue.mockResolvedValue({data:[]});await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ownerId:'admin-two',version:1,referenceId:'case-a'}));
 }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();}
});
