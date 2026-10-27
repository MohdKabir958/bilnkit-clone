// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService } from '../services/api';
import { InventoryPanel } from './InventoryPanel';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const product = { id:'milk',name:'Milk',vendorId:'store',vendor:{name:'Corner Store'},sku:'MILK-500',productKey:'milk',unit:'ml',packSize:'500',categoryId:'dairy',pricePaise:6545,mrpPaise:7000,stockQty:3,stockVersion:7,lowStock:true,lowStockThreshold:5,active:true,approvalStatus:'PENDING',description:'Sealed milk',imageUrls:[],taxRateBps:500 };
let host:HTMLDivElement,root:Root;
const button=(name:string)=>[...document.querySelectorAll('button')].find((b)=>b.textContent===name)!;
const type=async(label:string,value:string)=>act(async()=>{const el=[...document.querySelectorAll('label')].find((e)=>e.firstChild?.textContent===label)!.querySelector('input,textarea')!;Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const click=async(name:string)=>act(async()=>{button(name).click();});
const assist=async()=>{vi.spyOn(apiService,'openCatalogAssistance').mockResolvedValue({id:'synthetic-assistance',vendorId:'store',expiresAt:'2030-01-01T00:00:00Z'});await act(async()=>{const select=document.querySelector('[aria-label="Inventory store"]')!;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(select,'store');select.dispatchEvent(new Event('change',{bubbles:true}));});await click('Exceptional store assistance');await type('Assistance reason','Approved onboarding support request');await act(async()=>{(document.querySelector('form[aria-label="Exceptional catalog assistance"] input[type=checkbox]') as HTMLInputElement).click();});await act(async()=>{button('Start audited assistance').closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});};
beforeEach(async()=>{
  vi.spyOn(apiService,'fetchGeography').mockResolvedValue({cities:[{id:'blr',code:'blr',name:'Bengaluru',state:'Karnataka',active:true}],zones:[],coverage:[]});
  vi.spyOn(apiService,'inventoryPage').mockResolvedValue({data:[product],nextCursor:null});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  await act(async()=>root.render(<InventoryPanel vendors={[{id:'store',name:'Corner Store'}]} onAuthError={()=>{}}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
describe('grocery operations',()=>{
  it('shows exact prices, packs, stock and approval from persisted responses',()=>{
    expect(button('Add product')).toBeUndefined();expect(button('Edit product')).toBeUndefined();expect(button('Adjust stock')).toBeUndefined();expect(button('Inspect lots and reservations')).toBeTruthy();
    expect(host.textContent).toContain('Milk · 500 ml');expect(host.textContent).toContain('₹65.45');expect(host.textContent).toContain('MRP ₹70.00');expect(host.textContent).toContain('Available 3');expect(host.textContent).toContain('Low stock');
  });
  it('approves through the existing catalog moderation API',async()=>{
    const approve=vi.spyOn(apiService,'approveCatalogItem').mockResolvedValue(null);await click('Approve product');expect(approve).toHaveBeenCalledWith('milk',{});
  });
  it('records a versioned stock adjustment with reason and an idempotency key',async()=>{
    const save=vi.spyOn(apiService,'adjustProductStock').mockResolvedValue({});await assist();await click('Adjust stock');
    await type('Change in packs (+received / −removed)','5');await type('Reason','Received counted stock');
    await act(async()=>{button('Save stock adjustment').closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    expect(save).toHaveBeenCalledWith('milk',expect.objectContaining({delta:5,expectedVersion:7,assistanceId:'synthetic-assistance',reason:'Received counted stock',clientRequestId:expect.any(String)}));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('keeps failed changes visible and reuses the same stock request key for retry',async()=>{
    const save=vi.spyOn(apiService,'adjustProductStock').mockRejectedValue(new Error('Connection lost.'));
    await assist();await click('Adjust stock');await type('Change in packs (+received / −removed)','-1');await type('Reason','Damaged pack');
    const submit=async()=>act(async()=>{button('Save stock adjustment').closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    await submit();expect(host.querySelector('[role=alert]')?.textContent).toContain('Connection lost.');await submit();
    expect(save.mock.calls[0][1]).toEqual(save.mock.calls[1][1]);expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it('edits MRP, selling price and tax as exact integer minor units',async()=>{
    const save=vi.spyOn(apiService,'saveGroceryProduct').mockResolvedValue({});await assist();await click('Edit product');
    await type('Selling price (₹)','65.35');await type('MRP (₹, optional)','72.50');await type('Tax rate (%)','5');
    await act(async()=>{button('Save product').closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    expect(save).toHaveBeenCalledWith('milk',expect.objectContaining({pricePaise:6535,mrpPaise:7250,taxRateBps:500,packSize:'500',unit:'ml'}));
  });
});
