// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {apiService} from '../services/api';
const fixture=vi.hoisted(()=>({signedIn:true,signOut:vi.fn()}));
vi.mock('@clerk/react',()=>({useAuth:()=>({isLoaded:true,isSignedIn:fixture.signedIn,getToken:async()=>null,signOut:fixture.signOut}),SignIn:()=> <p>Official Clerk sign-in fixture</p>,SignUp:()=> <p>Official Clerk sign-up fixture</p>}));
import {RiderInvitePage} from './RiderInvitePage';
beforeEach(()=>{sessionStorage.clear();fixture.signedIn=true;window.history.replaceState(null,'','/partner-invite#invite='+'a'.repeat(64));});
afterEach(()=>{cleanup();vi.restoreAllMocks();window.history.replaceState(null,'','/');});
it('uses the authenticated intended-account endpoint and never claims rider approval',async()=>{
 const redeem=vi.spyOn(apiService,'redeemRiderInvitation').mockResolvedValue({verified:true,approvalGranted:false});render(<RiderInvitePage/>);
 expect(window.location.hash).toBe('');fireEvent.click(screen.getByRole('button',{name:'Verify intended account'}));await screen.findByText('Account ownership verified');
 expect(redeem).toHaveBeenCalledWith('a'.repeat(64));expect(screen.getByText(/no deliveries have been enabled/)).toBeTruthy();expect(sessionStorage.getItem('grozo_rider_invitation')).toBeNull();
});
it('sign-up uses Clerk components and does not call the protected verification endpoint before sign-in',()=>{
 fixture.signedIn=false;const redeem=vi.spyOn(apiService,'redeemRiderInvitation');render(<RiderInvitePage/>);expect(screen.getByText('Official Clerk sign-in fixture')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Create account'}));expect(screen.getByText('Official Clerk sign-up fixture')).toBeTruthy();expect(redeem).not.toHaveBeenCalled();
});
it('an invalid new link cannot accidentally redeem an older cached invitation',()=>{
 sessionStorage.setItem('grozo_rider_invitation',JSON.stringify({token:'b'.repeat(64),until:Date.now()+60000}));window.history.replaceState(null,'','/partner-invite#invite=invalid');render(<RiderInvitePage/>);expect(screen.getByRole('alert').textContent).toContain('complete invitation link');expect(sessionStorage.getItem('grozo_rider_invitation')).toBeNull();
});
