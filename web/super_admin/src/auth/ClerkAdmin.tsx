import React, { useEffect, useState } from 'react';
import { ClerkProvider, ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, UserButton, useAuth } from '@clerk/react';
import { App } from '../App';
import { apiService, installClerkTokenGetter, clearAuthToken } from '../services/api';
import type { AdminProfile } from '../types';
import { ApiError } from '../services/api';
import {AdminWelcome} from './AdminWelcome';
import {LoaderCircle,ShieldCheck} from 'lucide-react';

export const clerkEnabled = (import.meta.env.VITE_AUTH_MODE || 'legacy') !== 'legacy';

function SignInUnavailable({blockedResource = ''}: {blockedResource?: string}) {
  return <AdminWelcome><section className="k-panel space-y-4" role="alert">
    <h1 className="text-3xl">Secure sign-in could not load</h1>
    <p>Check your connection and browser privacy settings, then reload this page.</p>
    {blockedResource && <p>{blockedResource}</p>}
    <p>If this continues, share the first red browser console error with the Grozo operator. Do not share session tokens.</p>
    <button className="rounded-lg bg-green-800 px-6 py-3 text-white" onClick={() => window.location.reload()}>Reload sign-in</button>
  </section></AdminWelcome>;
}

function SignInLoading() {
  const [timedOut, setTimedOut] = useState(false);
  const [blockedResource, setBlockedResource] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 30_000);
    const onPolicyViolation = (event: SecurityPolicyViolationEvent) => {
      // Show only the origin/directive, never URLs containing session/query data.
      let origin: string;
      try { origin = new URL(event.blockedURI).origin; } catch { return; }
      if (!['script-src', 'script-src-elem', 'connect-src', 'frame-src'].includes(event.effectiveDirective)) return;
      setBlockedResource(`The browser blocked ${origin} (${event.effectiveDirective}). Contact the Grozo operator to review the site's security policy.`);
    };
    document.addEventListener('securitypolicyviolation', onPolicyViolation);
    return () => { window.clearTimeout(timer); document.removeEventListener('securitypolicyviolation', onPolicyViolation); };
  }, []);
  if (timedOut || blockedResource) return <SignInUnavailable blockedResource={blockedResource} />;
  return <AdminWelcome><div className="k-panel flex items-center gap-3" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-kraveo-g700"/>Loading secure sign-in…</div></AdminWelcome>;
}

function AdminSession() {
  const { isLoaded, isSignedIn, userId, sessionId, getToken, signOut } = useAuth();
  const [admin, setAdmin] = useState<AdminProfile>();
  const [verifiedFor,setVerifiedFor] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setAdmin(undefined); setError('');
    clearAuthToken(); // One-way cleanup of legacy keys; Clerk tokens are never manually persisted.
    if (!isLoaded || !isSignedIn) { installClerkTokenGetter(null); return; }
    let active = true;
    installClerkTokenGetter(force => getToken({skipCache:force}));
    apiService.validateSession().then(profile => { if (active) {setAdmin(profile);setVerifiedFor(`${userId}:${sessionId}`);} })
      .catch(reason => { if (active) setError(reason instanceof ApiError && reason.code === 'DEPLOYMENT_MISMATCH'
        ? reason.message
        : reason instanceof ApiError && reason.status === 403
        ? 'This account has not been approved as a Grozo administrator.'
        : reason instanceof ApiError && reason.status === 401
        ? 'Grozo could not authenticate this Clerk session (401). Sign out and retry. If this continues, ask the operator to check the Clerk instance and allowed website origin.'
        : 'Grozo could not verify administrator access. Check the connection and retry.'); });
    return () => { active = false; installClerkTokenGetter(null); };
  }, [isLoaded,isSignedIn,userId,sessionId,getToken,retry]);
  if (!isLoaded) return <main className="p-8" role="status">Loading secure sign-in…</main>;
  if (!isSignedIn) return <AdminWelcome><div className="mb-6"><p className="k-label">Team sign-in</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Welcome to your workspace</h2><p className="mt-3 text-sm leading-relaxed text-kraveo-ink2">Sign in with the email your owner has approved. New team members can create an account and verify that same email.</p></div><SignIn routing="hash" appearance={{variables:{colorPrimary:'#086331',colorForeground:'#17231d',colorMutedForeground:'#5e7066',colorBackground:'#ffffff',borderRadius:'12px',fontFamily:'inherit'},elements:{rootBox:'w-full',cardBox:'w-full shadow-none',card:'border border-kraveo-line shadow-none',headerTitle:'text-lg',headerSubtitle:'text-sm',formButtonPrimary:'bg-kraveo-g800'}}}/></AdminWelcome>;
  if (!admin || verifiedFor !== `${userId}:${sessionId}`) return <AdminWelcome><section className="k-panel space-y-5" aria-live="polite"><ShieldCheck className="h-9 w-9 text-kraveo-g700"/><div><p className="k-label">Workspace access</p><h2 className="mt-2 text-2xl font-bold">{error?'Your sign-in is complete':'Checking your access'}</h2></div><p className="text-sm leading-relaxed text-kraveo-ink2">{error || 'Checking server permissions…'}</p>{error?.includes('not been approved')&&<p className="rounded-k-md bg-kraveo-surface2 p-4 text-sm">Ask a Grozo owner to add your verified email in <strong>Team & access</strong>. You do not need a shared passcode.</p>}<div className="flex flex-wrap gap-3">{error&&<button className="k-btn-primary" onClick={()=>setRetry(v=>v+1)}>Retry</button>}<button className="k-btn-ghost" onClick={()=>void signOut()}>Sign out</button></div></section></AdminWelcome>;
  return <><div className="fixed bottom-4 right-4 z-50" aria-label="Clerk account"><UserButton /></div><App clerkAdmin={admin} onClerkSignOut={() => void signOut()} onClerkDenied={() => {setAdmin(undefined);setError('Your administrator session could not be authorized. Sign in again or contact Grozo support.');}} /></>;
}
export function ClerkAdminRoot() {
  const mode = import.meta.env.VITE_AUTH_MODE;
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
  if (!['clerk-test','clerk'].includes(mode || '') || !key.startsWith(mode === 'clerk-test' ? 'pk_test_' : 'pk_live_')) {
    return <main role="alert" className="p-8">Clerk configuration is missing or does not match this environment. Contact the Grozo operator.</main>;
  }
  return <ClerkProvider publishableKey={key} afterSignOutUrl="/">
    <ClerkLoading><SignInLoading /></ClerkLoading>
    <ClerkFailed><SignInUnavailable /></ClerkFailed>
    <ClerkLoaded><AdminSession /></ClerkLoaded>
  </ClerkProvider>;
}
