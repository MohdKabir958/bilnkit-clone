# 4. Admin integration design

Status: **not activated; the existing passcode/localStorage implementation remains** because the required mobile-first feasibility gate is unresolved.

The maintained React package is `@clerk/react` (registry review: 6.18.0, React 18 compatible). `@clerk/clerk-react` is deprecated in the registry and explicitly points to `@clerk/react`. Backend candidate `@clerk/express` was 2.1.81 (Node >=20.9). These were inspected, not installed into Grozo's runtime lockfiles.

After the gate passes:

1. Wrap the existing `src/main.tsx` tree in `ClerkProvider` using `VITE_CLERK_PUBLISHABLE_KEY`. Keep the existing error/toast boundaries and Grozo layout.
2. Use Clerk sign-in, signed-out/loading states and the SDK profile/sign-out UI. Protect the admin shell using both Clerk session state and a backend profile/RBAC check. A signed-in customer must see access denied, never admin data.
3. Change `src/services/api.ts` to obtain a fresh SDK `getToken()` asynchronously for every authenticated request. Preserve request cancellation/timeouts and API error contracts. Treat network/503 separately from rejected authentication; do not turn an outage into a destructive logout.
4. Remove `kraveo_admin_token`, `kraveo_admin_profile`, `memoryToken` and passcode consumers only after all have migrated. Clear old keys once. Do not manually persist Clerk tokens anywhere in localStorage.
5. Reconnect Socket.io using its auth callback to retrieve the current SDK token on each connection attempt. On expired/revoked/account-switched state, discard the old socket. Never reconnect using a token captured once at app startup.
6. Replace admin login/storage tests with provider-state fixtures plus real backend RBAC integration tests. Test all sensitive finance, inventory, assignment, approval, upload and operational events. A mock ClerkProvider is not evidence of Clerk-hosted sign-in.

Vercel root remains `web/super_admin`. Set `VITE_API_BASE_URL` to the exact Render HTTPS origin, `VITE_SOCKET_URL` to its Socket.io HTTPS origin, and `VITE_CLERK_PUBLISHABLE_KEY` to the environment's public key. The supplied `NEXT_PUBLIC_...` variable is for Next.js and is not automatically read by this Vite app.

CSP changes need observed Clerk resource requests: exact frontend API/CDN/frame domains, configured Google challenge resources if actually required, and the exact API HTTPS/WSS origins. Keep a narrow policy with no wildcard host permissions. Do not remove CSP, grant arbitrary Vercel origins, or promise the current `connect-src 'self'` policy already supports Clerk. Existing SPA rewrites must remain so direct route refresh works.
