// @vitest-environment jsdom
// Provider state/API fixtures only. This does not assert real Clerk-hosted authentication.
import React from 'react';
import {render,screen,waitFor,fireEvent,cleanup,act} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({failed:false,state:{isLoaded:true,isSignedIn:true,userId:'user_A',sessionId:'sess_A',getToken:vi.fn(),signOut:vi.fn()},validate:vi.fn(),install:vi.fn(),clear:vi.fn()}));
vi.mock('@clerk/react',()=>({
  ClerkProvider:({children}:{children:React.ReactNode})=><>{children}</>,
  ClerkLoading:({children}:{children:React.ReactNode})=>!fixture.state.isLoaded&&!fixture.failed?<>{children}</>:null,
  ClerkFailed:({children}:{children:React.ReactNode})=>fixture.failed?<>{children}</>:null,
  ClerkLoaded:({children}:{children:React.ReactNode})=>fixture.state.isLoaded&&!fixture.failed?<>{children}</>:null,
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
  fixture.failed=false;
  Object.assign(fixture.state,{isLoaded:true,isSignedIn:true,userId:'user_A',sessionId:'sess_A'});
  fixture.validate.mockReset().mockResolvedValue({id:'internal-admin',name:'Synthetic Admin',role:'ADMIN'});
  fixture.install.mockClear();fixture.clear.mockClear();fixture.state.getToken.mockReset().mockResolvedValue('fixture-session-token');fixture.state.signOut.mockReset();
});
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.useRealTimers();});
describe('Clerk admin trust boundary (explicit fixtures)',()=>{
  it('shows loading without mounting private admin content',()=>{fixture.state.isLoaded=false;render(<ClerkAdminRoot/>);expect(screen.getByRole('status')).toBeTruthy();expect(screen.queryByTestId('protected-admin')).toBeNull();});
  it('provider failure shows recovery without a backend request or legacy fallback',()=>{
    fixture.state.isLoaded=false;fixture.failed=true;render(<ClerkAdminRoot/>);
    expect(screen.getByRole('alert').textContent).toContain('Secure sign-in could not load');
    expect(screen.getByRole('button',{name:'Reload sign-in'})).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();expect(fixture.validate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('protected-admin')).toBeNull();
  });
  it('a stalled provider times out and can recover when the SDK becomes ready',async()=>{
    vi.useFakeTimers();fixture.state.isLoaded=false;const view=render(<ClerkAdminRoot/>);
    act(()=>{vi.advanceTimersByTime(30_000);});
    expect(screen.getByRole('alert')).toBeTruthy();expect(fixture.validate).not.toHaveBeenCalled();
    fixture.state.isLoaded=true;fixture.state.isSignedIn=false;view.rerender(<ClerkAdminRoot/>);
    expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByText('Official Clerk sign-in fixture')).toBeTruthy();
  });
  it('reports a blocked authentication origin without exposing URL query tokens',()=>{
    fixture.state.isLoaded=false;render(<ClerkAdminRoot/>);
    const event=new Event('securitypolicyviolation');
    Object.defineProperties(event,{blockedURI:{value:'https://synthetic.clerk.accounts.dev/client?token=PRIVATE_FIXTURE'},effectiveDirective:{value:'connect-src'}});
    act(()=>{document.dispatchEvent(event);});
    expect(screen.getByRole('alert').textContent).toContain('https://synthetic.clerk.accounts.dev (connect-src)');
    expect(screen.getByRole('alert').textContent).not.toContain('PRIVATE_FIXTURE');
    expect(fixture.validate).not.toHaveBeenCalled();
  });
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
  it('distinguishes a backend session rejection from missing administrator approval',async()=>{
    fixture.validate.mockRejectedValue(new ApiError(401,'Invalid session'));render(<ClerkAdminRoot/>);
    await screen.findByText(/Grozo could not authenticate this Clerk session \(401\)/);
    expect(screen.queryByText('This account has not been approved as a Grozo administrator.')).toBeNull();
    expect(screen.queryByTestId('protected-admin')).toBeNull();
    expect(fixture.state.signOut).not.toHaveBeenCalled();
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
