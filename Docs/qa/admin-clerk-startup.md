# Admin Clerk startup correction — 2026-10-21

## Confirmed cause

The owner's browser console reported `failed_to_load_clerk_js` for `https://capable-mutt-6.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, explicitly blocked by `script-src`. The deployed Vercel publishable key selected that instance, while the previously committed CSP allowed `enhanced-foal-30.clerk.accounts.dev`. This was an authentication SDK startup failure before any Grozo administrator permission check. Vercel marking the deployment Ready did not prove Clerk could initialize.

## Changes

- Regenerated the committed Vercel CSP for the observed `capable-mutt-6` instance, preserving exact Render HTTPS/WSS origins, restricted trusted Clerk/verification resources, security headers and SPA rewrites. No wildcard or disabled CSP was introduced. No secret key was needed.
- The admin build now verifies that its public key's Clerk origin, API origin and both Socket.io transports are allowed by committed CSP. A mismatched key stops the build with instructions to regenerate/commit configuration; generating headers only after Vercel has read them is not attempted.
- Use the official SDK's ClerkLoading/ClerkFailed/ClerkLoaded states. SDK failures show reload instructions; stalled startup offers recovery after 30 seconds. Relevant CSP events can show an origin and directive, without exposing URL paths, queries or tokens. The protected admin shell is not mounted while authentication loads or fails. Backend ADMIN authorization remains required.
- Updated the owner guide with the confirmed stable admin URL and current instance. Render settings must use the corresponding issuer, keys, webhook secret and approved Clerk subjects from that same application. Existing APK previews still use their recorded instance and remain unconnected; no APK rebuild is claimed here.

## Actual local checks

- `cd web/super_admin && npm test`: 822 passed, 0 failed, 0 skipped across 50 files; duration 29.94 s; exit 0. Includes provider failure, startup timeout/recovery and CSP origin redaction tests. Provider state is mocked; these are not hosted authentication checks.
- `node --test scripts/clerk/hosted_admin_config.test.mjs scripts/clerk/hosted_admin_build.test.mjs`: 8 passed, 0 failed, 0 skipped; duration 409.51283 ms; exit 0. Includes the exact class of instance mismatch, explicit script-src-elem restrictions, missing WebSocket origin and refusal of wildcards/insecure API settings.
- `npm run build` with `VITE_AUTH_MODE=clerk-test`, public configuration selecting the observed current instance, and API/socket `https://grozo-backend-3wdf.onrender.com`: exit 0. Vite reported an existing chunk-size advisory; it did not fail the build.
- Live admin HTTP inspection was blocked by the workspace proxy (CONNECT 403). Owner browser evidence established the CSP failure; hosted recovery must be verified after deployment. No backend secret, cloud environment variable, user role or database record was changed here.

## Owner verification

Deploy latest main to Vercel with the current capable-mutt-6 public key, then open `https://grozo-admin.vercel.app` and hard-refresh. Clerk sign-in should replace the loading text and the reported CSP violation must disappear. If a different message appears, inspect that new error rather than changing CSP to a wildcard. Before checking admin access, ensure Render uses the same Clerk instance and the exact administrator has both an allowlisted subject and an explicitly provisioned Grozo ADMIN role. Never paste private keys/session tokens into chat.
