# Connect the existing Vercel admin to Clerk staging

The admin passcode screen indicates a legacy build. There is no shared passcode for Clerk mode. Set these in Vercel → Project Settings → Environment Variables, for the environments you deploy:

```dotenv
VITE_AUTH_MODE=clerk-test
VITE_CLERK_PUBLISHABLE_KEY=YOUR_CURRENT_CLERK_DEVELOPMENT_PUBLISHABLE_KEY
VITE_API_BASE_URL=https://grozo-backend-3wdf.onrender.com
VITE_SOCKET_URL=https://grozo-backend-3wdf.onrender.com
```

Replace the publishable-key placeholder with the exact value from your current Clerk application's API Keys page. The owner-provided browser error on 2026-10-21 confirms the deployed key uses `capable-mutt-6.clerk.accounts.dev`; the earlier key in this conversation used `enhanced-foal-30.clerk.accounts.dev`. Do not mix their keys. The committed CSP now permits the current `capable-mutt-6` instance. Admin builds check that the selected key's origin and both backend transports are allowed by that policy.

These are public frontend values; do not add backend secrets. Root Directory is `web/super_admin`. Deploy the latest `main` commit after saving the variables; Vite embeds them at build time. Open the stable URL `https://grozo-admin.vercel.app`, not the old immutable deployment URL. `vercel.json` retains CSP and SPA rewrites. If you change the Clerk application again, regenerate and commit the policy with `scripts/configure_hosted_admin.mjs` before deploying.

Set Render `ADMIN_URL`, `CLIENT_URL` and `CLERK_AUTHORIZED_PARTIES` to `https://grozo-admin.vercel.app`, without a trailing slash; retain individually approved origins if other clients require them. Configure the corresponding origin/redirects in the same Clerk development instance. Render `CLERK_ISSUER` must be `https://capable-mutt-6.clerk.accounts.dev`, with the publishable key, rotated secret key, webhook signing secret and approved admin identities from that same instance. Changing only the issuer cannot make another instance's credentials work. Redeploy Render after updating its configuration. No owner cloud configuration was changed from this workspace.

## Provision your administrator

1. Create/verify your intended account in the Clerk development instance. Copy its exact `user_...` ID from Clerk → Users.
2. Add that ID to Render `CLERK_ADMIN_USER_IDS` and redeploy. This allowlist alone does not grant the database ADMIN role.
3. Since Render Free has no shell, use a trusted local checkout and the existing operator CLI. Configure the intended staging database URL, rotated Clerk secret, exact allowlisted ID and other backend configuration privately in `backend/.env` or your shell environment. Never commit the file. A production database is not appropriate for this staging bootstrap.
4. From `backend`, after `npm ci`, run in PowerShell, replacing the subject with your exact ID:

```powershell
npm run build
$env:CLERK_OPERATOR_REFERENCE = "owner-approved-staging-admin-bootstrap"
node scripts/clerk-identity.mjs admin user_YOUR_ACTUAL_CLERK_ID
```

The CLI verifies the identity with Clerk, requires the explicit allowlist and records an audit. If preserving an existing Grozo ADMIN UUID, use the controlled `link` procedure in document 06 instead. Do not edit role values in the browser or profile metadata.

Sign in through the deployed Clerk form. Only the provisioned account should enter the console; other authenticated accounts must be refused. A verification code requested by Clerk is sent through the configured verification method, not a Grozo shared code.

## Verification performed for this configuration

The updated Clerk-test admin build passed with the current instance and backend origins. All 822 admin tests passed; the CSP generator/build checks passed all 8 tests. Loading failures now show recovery instructions, and a 30-second stalled initialization offers reload without bypassing authentication. These are local checks, not evidence of hosted Clerk sign-in, a provisioned staging administrator or live backend availability. No cloud settings or user records were changed by this configuration commit.
