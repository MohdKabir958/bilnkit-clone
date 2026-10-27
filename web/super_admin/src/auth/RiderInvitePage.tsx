import {useEffect,useState} from 'react';
import {SignIn,SignUp,useAuth} from '@clerk/react';
import {apiService,installClerkTokenGetter} from '../services/api';
import {useRetryDelay} from '../lib/retryDelay';
import {AdminWelcome} from './AdminWelcome';

const key='grozo_rider_invitation';
function invitationToken() {
  const token=new URLSearchParams(window.location.hash.slice(1)).get('invite');
  if(token&&/^[a-f0-9]{64}$/.test(token)){try{sessionStorage.setItem(key,JSON.stringify({token,until:Date.now()+72*3600000}));}catch{}window.history.replaceState(null,'',window.location.pathname);return token;}
  if(new URLSearchParams(window.location.hash.slice(1)).has('invite')){try{sessionStorage.removeItem(key);}catch{}return '';}
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.until>Date.now()&&/^[a-f0-9]{64}$/.test(saved.token))return saved.token;}catch{}
  return '';
}
export function RiderInvitePage() {
  const {isLoaded,isSignedIn,getToken,signOut}=useAuth();
  const [token]=useState(invitationToken),[signup,setSignup]=useState(false),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const retry=useRetryDelay();
  useEffect(()=>{if(!isSignedIn)return;installClerkTokenGetter(force=>getToken({skipCache:force}));return()=>installClerkTokenGetter(null);},[isSignedIn,getToken]);
  const verify=async()=>{if(busy||retry.seconds)return;setBusy(true);setError('');try{await apiService.redeemRiderInvitation(token);setVerified(true);try{sessionStorage.removeItem(key);}catch{}}catch(e){retry.apply(e);setError(e instanceof Error?e.message:'Invitation could not be verified.');}finally{setBusy(false);}};
  return <AdminWelcome audience="rider"><section className="k-panel space-y-5"><p className="k-label">Grozo delivery partner onboarding</p><h2 className="text-3xl font-bold">Verify your rider invitation</h2><p className="text-sm text-kraveo-ink2">Use the verified email the operator invited. This step verifies account ownership. Grozo must still review your identity, vehicle and service area before approving deliveries.</p>
    {!token?<p role="alert">Open the complete invitation link provided by your operator.</p>:!isLoaded?<p role="status">Loading secure sign-in…</p>:!isSignedIn?<><div className="flex gap-3"><button className="k-btn-ghost" onClick={()=>setSignup(false)}>Sign in</button><button className="k-btn-ghost" onClick={()=>setSignup(true)}>Create account</button></div>{signup?<SignUp routing="hash" forceRedirectUrl="/partner-invite"/>:<SignIn routing="hash" forceRedirectUrl="/partner-invite"/>}</>:verified?<div role="status" className="rounded-k-md bg-kraveo-g50 p-4"><h2 className="font-bold">Account ownership verified</h2><p>Ask your operator to complete identity and vehicle checks. Rider approval and duty remain separate; no deliveries have been enabled by this invitation.</p></div>:<><button className="k-btn-primary" disabled={busy||retry.seconds>0} onClick={()=>void verify()}>{busy?'Verifying invitation…':'Verify intended account'}</button>{error&&<p role="alert">{error}</p>}{retry.seconds>0&&<p role="status">Try again in {retry.seconds}s.</p>}</>}
    {isSignedIn&&<button className="k-btn-ghost" onClick={()=>void signOut({redirectUrl:'/partner-invite'})}>Sign out / use another account</button>}
  </section></AdminWelcome>;
}
