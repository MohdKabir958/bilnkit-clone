# 4. React admin integration

Root directory: **`web/super_admin`**. This is Vite/React, so use `VITE_CLERK_PUBLISHABLE_KEY`, not `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

The maintained `@clerk/react` package supplies ClerkProvider, SignIn, UserButton and useAuth. `ClerkAdminRoot` shows loading/sign-in/error states and waits for Grozo's admin validation before mounting private screens. An authenticated customer sees access denied. A provider/network outage offers retry; it does not silently grant access or return to the passcode form.

`api.ts` retrieves a current session token with the SDK for each protected API/download request. Socket.io obtains a fresh token on every connection/reconnection. The old `kraveo_admin_token`/profile entries are cleared and ignored in Clerk mode. Clerk tokens are never manually persisted in localStorage. Account/session changes unmount the old private shell. The profile menu and sign-out use Clerk.

Set in Vercel's environment settings:

```text
VITE_AUTH_MODE=clerk-test
VITE_CLERK_PUBLISHABLE_KEY=<development public key>
VITE_API_BASE_URL=https://YOUR-RENDER-HOST
VITE_SOCKET_URL=https://YOUR-RENDER-HOST
```

The API client adds `/api` internally. Do not append `/api` to these two admin origins. No secret belongs in Vite variables. Rebuild after changing them.

Before importing/redeploying Vercel, generate and commit the CSP with the exact backend origin and public key using document 07. It allows the exact Clerk frontend, Render HTTPS/WSS, Clerk image/telemetry and Cloudflare challenge origins; no wildcard origins. Add exact owned product-image origins only when needed. Existing SPA rewrites preserve route refreshes.

Admin partner creation/password-reset controls are hidden in Clerk mode. Partners apply through the authenticated native flow; historical identities can be linked only by an operator. Approval/status/inventory/finance screens continue to use backend RBAC.

Local checks: `npm ci --include=dev`, `npm test -- --runInBand`, `npm run build` from `web/super_admin`. Unit tests mock SDK state explicitly; hosted sign-in, CSP, cross-origin sessions, redirects and reconnects still need deployed browser verification.
