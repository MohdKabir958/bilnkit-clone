import React, { useEffect, useState } from 'react';
import { ClerkProvider, ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, UserButton, useAuth } from '@clerk/react';
import { App } from '../App';
import { apiService, installClerkTokenGetter, clearAuthToken } from '../services/api';
import type { AdminProfile } from '../types';
import { ApiError } from '../services/api';

export const clerkEnabled = (import.meta.env.VITE_AUTH_MODE || 'legacy') !== 'legacy';

function SignInUnavailable({blockedResource = ''}: {blockedResource?: string}) {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8" role="alert">
    <h1 className="text-3xl">Secure sign-in could not load</h1>
    <p>Check your connection and browser privacy settings, then reload this page.</p>
    {blockedResource && <p>{blockedResource}</p>}
    <p>If this continues, share the first red browser console error with the Grozo operator. Do not share session tokens.</p>
    <button className="rounded-lg bg-green-800 px-6 py-3 text-white" onClick={() => window.location.reload()}>Reload sign-in</button>
  </main>;
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
  return <main className="p-8" role="status">Loading secure sign-in…</main>;
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
      .catch(reason => { if (active) setError(reason instanceof ApiError && reason.status === 403
        ? 'This account has not been approved as a Grozo administrator.'
        : reason instanceof ApiError && reason.status === 401
        ? 'Grozo could not authenticate this Clerk session (401). Sign out and retry. If this continues, ask the operator to check the Clerk instance and allowed website origin.'
        : 'Grozo could not verify administrator access. Check the connection and retry.'); });
    return () => { active = false; installClerkTokenGetter(null); };
  }, [isLoaded,isSignedIn,userId,sessionId,getToken,retry]);
  if (!isLoaded) return <main className="p-8" role="status">Loading secure sign-in…</main>;
  if (!isSignedIn) return <main className="min-h-screen flex flex-col items-center justify-center gap-6"><h1 className="text-3xl">Grozo Admin</h1><SignIn routing="hash" /></main>;
  if (!admin || verifiedFor !== `${userId}:${sessionId}`) return <main className="p-8" aria-live="polite"><h1>Grozo administrator access</h1><p>{error || 'Checking server permissions…'}</p>{error && <button onClick={() => setRetry(v => v+1)}>Retry</button>} <button onClick={() => void signOut()}>Sign out</button></main>;
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
