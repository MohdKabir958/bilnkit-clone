// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {CashLedgerPanel} from './CashLedgerPanel';
import {apiService,type CashEntry} from '../services/api';
const row:CashEntry={id:'cash-a',orderId:'order-a',driverUserId:'rider-a',amountPaise:20500,collectedAt:'2026-10-21T12:00:00Z',remittedAt:null,refundedAt:null,order:{status:'DELIVERED',vendor:{name:'QA Vegetable shop',cityId:'city-a'}}};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('shows an honest empty state',async()=>{vi.spyOn(apiService,'fetchCash').mockResolvedValue({success:true,data:[],nextCursor:null});render(<CashLedgerPanel onAuthError={()=>{}}/>);expect(await screen.findByText(/No cash collected yet/)).toBeTruthy();});
it('requires an explicit receipt before recording physical handover',async()=>{vi.spyOn(apiService,'fetchCash').mockResolvedValue({success:true,data:[row],nextCursor:null});const record=vi.spyOn(apiService,'recordCash').mockResolvedValue({});render(<CashLedgerPanel onAuthError={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Record cash handover'}));expect(record).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText('Receipt / reference'),{target:{value:'receipt-2026-001'}});fireEvent.click(screen.getByRole('button',{name:'Confirm receipt'}));await waitFor(()=>expect(record).toHaveBeenCalledWith('cash-a','remit','receipt-2026-001'));});
it('does not offer a platform cash refund while cash is still with the rider',async()=>{vi.spyOn(apiService,'fetchCash').mockResolvedValue({success:true,data:[row],nextCursor:null});render(<CashLedgerPanel onAuthError={()=>{}}/>);await screen.findByText('With rider');expect(screen.queryByRole('button',{name:'Record completed cash refund'})).toBeNull();});
