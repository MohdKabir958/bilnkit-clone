import {expect,it} from 'vitest';
import {normalizeOrder} from '../types';
import {cancelMoneyNote,isUnpaidOpen,nextStep,reassignBlockedReason} from './orders';
const cash=(status='PLACED')=>normalizeOrder({id:'cash-order',status,paymentMethod:'COD',paymentStatus:'PENDING',totalAmount:205,driverId:'rider'});
it('keeps the cash payment method through normalization and live merges',()=>expect(cash().paymentMethod).toBe('COD'));
it('cash due is actionable without marking it paid online',()=>{const o=cash();expect(isUnpaidOpen(o)).toBe(false);expect(nextStep(o)?.blockedReason).toBeNull();expect(reassignBlockedReason(o)).toBeNull();expect(o.paymentStatus).toBe('PENDING');});
it('cash cancellation never promises a Razorpay refund',()=>{expect(cancelMoneyNote(cash())).toEqual({refunds:false,text:'No cash has been collected. No gateway refund is required.'});});
it('admin cannot bypass assigned rider cash confirmation by entering a code',()=>expect(nextStep(cash('ARRIVED_AT_GATE'),'1234')?.blockedReason).toContain('assigned rider'));
