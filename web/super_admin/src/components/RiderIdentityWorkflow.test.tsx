// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {CreateRiderDrawer} from './CreateRiderDrawer';
import {RiderInvitationForm} from './RiderInvitations';
import {apiService,ApiError} from '../services/api';
beforeEach(()=>{vi.spyOn(apiService,'fetchGeography').mockResolvedValue({cities:[],zones:[],coverage:[]});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
const identity=async()=>{render(<CreateRiderDrawer open onClose={()=>{}} onCreated={()=>{}}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Next: Vehicle'}).hasAttribute('disabled')).toBe(false));for(const [label,value] of [["Partner's verified email",'synthetic-rider@example.invalid'],['Rider full name','Synthetic Rider'],['Rider mobile number','9000000881']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.click(screen.getByRole('button',{name:'Next: Vehicle'}));};
it('a 409 identity conflict is shown before Review and offers an invitation without creating a rider',async()=>{
 const check=vi.spyOn(apiService,'checkRiderEligibility').mockRejectedValue(new ApiError(409,'Verify this email before assignment.','PARTNER_ACCOUNT_REQUIRED','email')),create=vi.spyOn(apiService,'createRider');
 await identity();expect((await screen.findByRole('alert')).textContent).toContain('Verify this email');expect(check).toHaveBeenCalledWith('synthetic-rider@example.invalid');expect(create).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Create onboarding invitation'})).toBeTruthy();expect((screen.getByLabelText("Partner's verified email") as HTMLInputElement).value).toBe('synthetic-rider@example.invalid');
});
it('actual 429 blocks repeated identity requests and preserves the form without auto retry',async()=>{
 const check=vi.spyOn(apiService,'checkRiderEligibility').mockRejectedValue(new ApiError(429,'Slow down.','RATE_LIMITED',undefined,{retryAfterSeconds:120}));await identity();await screen.findByText(/Try again in 120s/);
 fireEvent.click(screen.getByRole('button',{name:'Next: Vehicle'}));expect(check).toHaveBeenCalledTimes(1);expect((screen.getByLabelText('Rider full name') as HTMLInputElement).value).toBe('Synthetic Rider');
});
it('manual invitation requires consent and never claims an email was sent or rider approved',async()=>{
 const create=vi.spyOn(apiService,'createRiderInvitation').mockResolvedValue({id:'invite',email:'synthetic-rider@example.invalid',state:'PENDING',expiresAt:'2099-01-01T00:00:00Z',createdAt:'2026-10-27T00:00:00Z',redeemedAt:null,inviteUrl:'https://admin.example.invalid/partner-invite#invite='+'a'.repeat(64),delivery:{mode:'MANUAL',sent:false}});
 render(<RiderInvitationForm initialEmail="synthetic-rider@example.invalid"/>);expect((screen.getByRole('button',{name:'Create invitation link'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Create invitation link'}));await screen.findByText('Invitation link created · no email sent');expect(create).toHaveBeenCalledWith('synthetic-rider@example.invalid',true);expect(screen.getByLabelText('Private onboarding link')).toBeTruthy();
});
