// @vitest-environment jsdom
// Provider state/API fixtures only. This does not assert real Clerk-hosted authentication.
import React from 'react';
import {render,screen,waitFor,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({state:{isLoaded:true,isSignedIn:true,userId:'user_A',sessionId:'sess_A',getToken:vi.fn(),signOut:vi.fn()},validate:vi.fn(),install:vi.fn(),clear:vi.fn()}));
vi.mock('@clerk/react',()=>({
  ClerkProvider:({children}:{children:React.ReactNode})=><>{children}</>,
  SignIn:()=> <div>Official Clerk sign-in fixture</div>,UserButton:()=> <button>Clerk account</button>,useAuth:()=>fixture.state,
}));
vi.mock('../App',()=>({App:()=> <div data-testid="protected-admin">Verified admin shell</div>}));
vi.mock('../services/api',()=>({
  apiService:{validateSession:fixture.validate},installClerkTokenGetter:fixture.install,clearAuthToken:fixture.clear,
  ApiError:class extends Error {constructor(public status:number,message:string){super(message);}},
}));
import {ClerkAdminRoot} from './ClerkAdmin';
import {ApiError} from '../services/api';
beforeEach(()=>{
  vi.stubEnv('VITE_AUTH_MODE','clerk-test');vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY','pk_test_public_fixture');
  Object.assign(fixture.state,{isLoaded:true,isSignedIn:true,userId:'user_A',sessionId:'sess_A'});
  fixture.validate.mockReset().mockResolvedValue({id:'internal-admin',name:'Synthetic Admin',role:'ADMIN'});
  fixture.install.mockClear();fixture.clear.mockClear();fixture.state.getToken.mockReset().mockResolvedValue('fixture-session-token');fixture.state.signOut.mockReset();
});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
describe('Clerk admin trust boundary (explicit fixtures)',()=>{
  it('shows loading without mounting private admin content',()=>{fixture.state.isLoaded=false;render(<ClerkAdminRoot/>);expect(screen.getByRole('status')).toBeTruthy();expect(screen.queryByTestId('protected-admin')).toBeNull();});
  it('signed-out state uses Clerk sign-in instead of a passcode',()=>{fixture.state.isSignedIn=false;render(<ClerkAdminRoot/>);expect(screen.getByText('Official Clerk sign-in fixture')).toBeTruthy();expect(fixture.validate).not.toHaveBeenCalled();});
  it('mounts admin only after server validation and provides fresh SDK token getter',async()=>{
    render(<ClerkAdminRoot/>);await screen.findByTestId('protected-admin');
    const getter=fixture.install.mock.calls.find(call=>typeof call[0]==='function')![0];
    expect(await getter(true)).toBe('fixture-session-token');expect(fixture.state.getToken).toHaveBeenCalledWith({skipCache:true});
  });
  it('Clerk login cannot grant admin when backend returns 403',async()=>{
    fixture.validate.mockRejectedValue(new ApiError(403,'Not an administrator'));render(<ClerkAdminRoot/>);
    await screen.findByText('This account has not been approved as a Grozo administrator.');expect(screen.queryByTestId('protected-admin')).toBeNull();
    fireEvent.click(screen.getByText('Sign out'));expect(fixture.state.signOut).toHaveBeenCalled();
  });
  it('backend outage offers retry without revoking the Clerk session',async()=>{
    fixture.validate.mockRejectedValueOnce(new ApiError(503,'offline'));render(<ClerkAdminRoot/>);await screen.findByText('Retry');
    expect(fixture.state.signOut).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Retry'));await screen.findByTestId('protected-admin');
  });
  it('changing Clerk identity immediately hides the previously authorized shell',async()=>{
    const view=render(<ClerkAdminRoot/>);await screen.findByTestId('protected-admin');
    fixture.state.userId='user_B';fixture.state.sessionId='sess_B';fixture.validate.mockReturnValue(new Promise(()=>{}));
    view.rerender(<ClerkAdminRoot/>);expect(screen.queryByTestId('protected-admin')).toBeNull();
    await waitFor(()=>expect(fixture.validate).toHaveBeenCalledTimes(2));
  });
  it('invalid Clerk mode/key fails closed without exposing legacy login',()=>{vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY','');render(<ClerkAdminRoot/>);expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByTestId('protected-admin')).toBeNull();});
});
