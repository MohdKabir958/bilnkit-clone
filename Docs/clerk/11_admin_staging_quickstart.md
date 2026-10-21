# Connect the existing Vercel admin to Clerk staging

The admin passcode screen indicates a legacy build. There is no shared passcode for Clerk mode. Set these in Vercel → Project Settings → Environment Variables, for the environments you deploy:

```dotenv
VITE_AUTH_MODE=clerk-test
VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZW5oYW5jZWQtZm9hbC0zMC5jbGVyay5hY2NvdW50cy5kZXYk
VITE_API_BASE_URL=https://grozo-backend-3wdf.onrender.com
VITE_SOCKET_URL=https://grozo-backend-3wdf.onrender.com
```

These are public frontend values; do not add backend secrets. Root Directory is `web/super_admin`. Deploy the latest `feature/india-grocery-platform` commit after saving the variables; Vite embeds them at build time. Open the new deployment, not the old immutable deployment URL. `vercel.json` is configured for this exact Render origin and public Clerk instance, retaining CSP and SPA rewrites.

Find the stable admin URL in Vercel → Settings → Domains. Set Render `ADMIN_URL`, `CLIENT_URL` and `CLERK_AUTHORIZED_PARTIES` to that exact HTTPS origin without a path or trailing slash; retain individually approved origins if other clients require them. Configure the corresponding origin/redirects in the same Clerk development instance. Redeploy Render. The changing deployment URL shown in the screenshot is not a confirmed stable domain.

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

The Clerk-test admin build passed with the four public values above. The two targeted authentication/API test files passed all 12 tests; the CSP generator passed all 3 tests. These are local checks, not evidence of hosted Clerk sign-in, a provisioned staging administrator or live backend availability. No cloud settings or user records were changed by this configuration commit.
