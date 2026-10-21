# 7. Deploy staging: Neon database → Render API → Vercel admin

This guide deploys a **separate Clerk development/staging environment**. No deployment has been performed for you. Keep production databases, accounts and money separate. Render's supported baseline is a paid Starter web service with a 1 GB persistent disk; check the current quoted monthly prices before clicking Create/Apply. Neon/Vercel plan limits and any upgrades must also be reviewed. This guide is not authorization to purchase resources.

## A. Prepare GitHub and Clerk

1. Use repository `MohdKabir958/bilnkit-clone`, branch `feature/india-grocery-platform`, at the implementation commit in the handover. Connect GitHub to Render and Vercel with access to this repository.
2. Rotate the Clerk Secret Key previously shared in chat. Keep the replacement private. Complete [Clerk dashboard setup](02_clerk_dashboard_setup.md). Use the **development** instance for this staging deployment.
3. Choose a distinct admin Vercel project name, e.g. an available `grozo-admin-staging-YOUR-SUFFIX`. Reserve/create the project and note its actual assigned `https://…vercel.app` origin. A first deployment may wait until section D. Use the actual domain, not this example, in the steps below. Avoid transient preview URLs for this test environment.
4. Do not enable automatic production cutover. The default Blueprint remains `AUTH_MODE=legacy`; configure staging manually as below. A single environment must use matching Clerk mode across its clients/API.

## B. Neon PostgreSQL

1. In Neon, create a **new staging project/database** near Render's Singapore region when available. Name it clearly, e.g. `grozo-clerk-staging`. Do not select/import a production database. Retain the generated database user/password privately.
2. Open Connect. Select the staging branch, database and role. Copy the pooled connection string (pooling enabled) and the direct string (pooling disabled). Both must use TLS (`sslmode=require`).
3. Store the pooled string as Render `DATABASE_URL`. Retain any Neon-provided security parameters; add Prisma's bounded connection options with `&` when the URL already has a query:

```text
postgresql://USER:PASSWORD@NEON-POOLER-HOST/DATABASE?sslmode=require&connection_limit=5&pool_timeout=10
```

4. Store the direct string as Render `MIGRATION_DATABASE_URL`:

```text
postgresql://USER:PASSWORD@NEON-DIRECT-HOST/DATABASE?sslmode=require
```

5. Never paste either connection string in Git, screenshots or chat. No database URL belongs in Vercel or Android.
6. The Render pre-deploy command will apply the repository's controlled migrations using the direct URL. Do not run reset or destructive schema push commands. Keep one Render instance for the current socket/persistent-upload architecture.
7. After migration, verify in the Neon SQL editor (staging only):

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'User' AND column_name IN ('id', 'clerkUserId');
SELECT indexname FROM pg_indexes
WHERE tablename = 'User' AND indexdef LIKE '%clerkUserId%';
SELECT migration_name, finished_at FROM "_prisma_migrations"
ORDER BY started_at DESC LIMIT 5;
SELECT COUNT(*) FROM "ClerkIdentityState";
```

Expect the existing UUID `id`, nullable `clerkUserId`, its unique index, and completed migrations including `20261021060000_clerk_identity`. Initial identity counts can be zero. Preserve any existing-data ownership links through document 06; do not auto-claim matching emails.

## C. Render backend

The prepared `deploy/render.clerk-staging.yaml` expresses this separate staging configuration. Applying it creates paid resources; the manual steps below show the same settings. `render.yaml` keeps the existing production default unchanged.

1. New → Web Service → connect the repository and feature branch. **Root Directory: `backend`**. Runtime Node, supported Node version `24.19.0`. Choose Starter and one instance after reviewing cost. Disable automatic deployment while configuring.
2. Set these commands:

| Setting | Value |
| --- | --- |
| Build | `npm ci --include=dev && npx prisma generate && npm run build` |
| Pre-deploy | `node scripts/migrate-hosted.mjs` |
| Start | `node scripts/start-render.mjs` |
| Health check | `/ready` |

3. Add the persistent disk: mount `/var/data/grozo`, size 1 GB. Set `UPLOAD_DIR=/var/data/grozo/uploads`. Keep it across redeploys. A service without persistence is not the supported product-image deployment.
4. In Environment enter the following **staging** values. Environment settings are separate from repository files:

| Variable | Staging value / source |
| --- | --- |
| `NODE_VERSION` | `24.19.0` |
| `NODE_ENV` | `development` (required by isolated `clerk-test`; do not label this production) |
| `AUTH_MODE` | `clerk-test` |
| `DATABASE_URL` | Neon staging pooled TLS URL from B |
| `MIGRATION_DATABASE_URL` | Neon staging direct TLS URL from B |
| `CLERK_PUBLISHABLE_KEY` | Development `pk_test_…` public key |
| `CLERK_SECRET_KEY` | **Rotated** development `sk_test_…`, backend only |
| `CLERK_ISSUER` | Exact development instance HTTPS origin; provided public instance is `https://enhanced-foal-30.clerk.accounts.dev` |
| `CLERK_AUTHORIZED_PARTIES` | Exact assigned Vercel admin HTTPS origin; comma-separated only for individually approved extra origins |
| `CLERK_ALLOW_NATIVE_WITHOUT_AZP` | `true` for verified native SDK tokens without `azp` |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Endpoint signing secret from Clerk; see step 5 |
| `CLERK_ADMIN_USER_IDS` | Exact approved admin `user_…` IDs, comma-separated |
| `DELIVERY_PROOF_SECRET` | Fresh random >=32-character staging HMAC key; existing-data cutover instead preserves old JWT signing value (document 06) |
| `PAYOUT_ENC_KEY` | Separate random 32-byte base64 encryption key; never reuse Clerk/payment keys |
| `ADMIN_URL` | Exact assigned Vercel admin origin |
| `CLIENT_URL` | Same admin origin for this Android-first staging setup; add only an actual trusted web client if needed |
| `PUBLIC_BASE_URL` | Actual Render HTTPS origin (the start wrapper can derive it from `RENDER_EXTERNAL_URL`) |
| `UPLOAD_DIR` | `/var/data/grozo/uploads` |
| `PAYMENT_PROVIDER` | `disabled` for a no-charge development staging service |

Generate secrets securely with your password manager or a local cryptographic generator; do not use example strings. Clerk mode does not require `JWT_SECRET`, `ADMIN_PASSCODE` or `GOOGLE_WEB_CLIENT_ID`. Do not delete independent payout, payment or Firebase secrets from existing deployments. `CLERK_AUDIENCE` is optional and must match Clerk token configuration if enabled.

5. Render assigns the service URL when the service is created. In Clerk, add webhook `https://ACTUAL-RENDER-HOST/api/webhooks/clerk`, select the three user events listed in document 02, and copy its signing secret to Render. If the first deploy failed because this setting was absent, save it and redeploy; do not fabricate a secret to force boot.
6. `PAYMENT_PROVIDER=disabled` is allowed **only** in development. It intentionally prevents charges; checkout reports provider unavailable. To test real sandbox payments later, switch to `razorpay` and configure owned Razorpay **test** key ID, key secret and webhook signing secret. Production payment validation is not weakened.
7. For FCM testing, add the owned Firebase service account as a Render Secret File, set `FIREBASE_KEY_PATH` to its actual mounted file path, and rebuild APKs with owned client configuration. Keep FCM separate from Clerk. Without it, document notifications as unverified.
8. Deploy. Inspect migration/build/start logs without sharing credentials. Open:

```sh
curl --fail https://ACTUAL-RENDER-HOST/health
curl --fail https://ACTUAL-RENDER-HOST/ready
curl -i https://ACTUAL-RENDER-HOST/api/auth/profile
```

Expect successful health/readiness and a JSON **401** on the private profile without a session. A 503 readiness result means database/configuration needs repair; do not proceed as if healthy. Confirm a legacy login route returns **410** in Clerk mode.
9. Open Render Shell in `backend` and run admin provisioning from document 06, using the intended exact Clerk subject. Login alone never creates an administrator. Send a signed Clerk test webhook and verify success in its delivery log.

## D. Vercel admin portal

1. Configure CSP **before** Vercel reads the repository configuration. From the repository root on a development machine, substitute your actual backend origin and public key:

```sh
GROZO_BACKEND_ORIGIN=https://ACTUAL-RENDER-HOST \
VITE_CLERK_PUBLISHABLE_KEY=YOUR_PUBLIC_PK_TEST_KEY \
node scripts/configure_hosted_admin.mjs
```

On Windows PowerShell, run the equivalent from your local repository folder (with Node and Git installed):

```powershell
$env:GROZO_BACKEND_ORIGIN = "https://ACTUAL-RENDER-HOST"
$env:VITE_CLERK_PUBLISHABLE_KEY = "YOUR_PUBLIC_PK_TEST_KEY"
node scripts/configure_hosted_admin.mjs
git add web/super_admin/vercel.json
git commit -m "Configure staging admin CSP"
git push origin feature/india-grocery-platform
```

This updates `web/super_admin/vercel.json` with exact Render HTTPS/WSS and Clerk resources. Commit and push that configuration to the feature branch before deployment. It does not require a Secret Key. For external product storage, optionally supply comma-separated exact `GROZO_PRODUCT_IMAGE_ORIGINS`; backend-hosted product images already work. Do not add `*`, remove CSP, or use fictional placeholder domains. Running this only inside Vercel's build is too late to reliably configure deployment headers.

2. Vercel → Add New Project → import the same repository. On the multiple-app screen, click **Import single project next to `super_admin`**. Choose **Root Directory `web/super_admin`**, Framework Vite, build `npm run build`, output `dist`, install `npm ci`. Do not select `backend`, `web/landing` or the repository root.
3. Set Vercel environment variables for the selected staging deployment:

| Variable | Value |
| --- | --- |
| `VITE_AUTH_MODE` | `clerk-test` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same Clerk development public key |
| `VITE_API_BASE_URL` | Actual Render origin, e.g. `https://ACTUAL-RENDER-HOST` (no `/api`) |
| `VITE_SOCKET_URL` | Same Render HTTPS origin (Socket.io negotiates WSS) |

No database URL, Clerk Secret Key, webhook secret, passcode or payout key belongs here. Vite public variables enter the browser bundle.

4. Deploy/redeploy. Ensure the **actual assigned stable admin URL** matches Render `ADMIN_URL`/`CLERK_AUTHORIZED_PARTIES`, Clerk authorized web origins and redirect configuration. If it differs, update those exact values and redeploy/restart affected services.
5. Open the portal. Clerk sign-in must render. Sign in as the provisioned administrator; inspect the network tab for successful backend validation, Bearer-protected API requests and authenticated Socket.io. A normal customer must receive 403 and never see private admin data. Refresh a nested route; SPA fallback must not return 404.
6. Inspect response headers and browser console. CSP must include the actual Render and Clerk origins. For a blocked genuinely required resource, add its exact trusted origin through the CSP tool; do not weaken the whole policy. Test logout, token renewal and account switching. These are real deployed checks, not covered by mocked unit results.

## E. Connect Android and complete acceptance

Rebuild each APK using `python3 scripts/clerk/build_test_apks.py --app customer --backend-origin https://ACTUAL-RENDER-HOST`, and repeat with `vendor`/`driver`. Test with the Pass/Fail sheet in document 10. Configure owned Firebase/release signing separately when moving beyond these development previews. Only after connected staging tests and explicit approval should production use live Clerk keys, `NODE_ENV=production`, `AUTH_MODE=clerk`, a separate production database/instance, real payment configuration and coordinated clients. No production cutover is implied by this guide.

## Existing Render service was created with Docker

The default Docker image now starts the API as the non-root node user and includes the pinned Prisma CLI, schema and migration scripts needed by Render's pre-deploy phase. Explicit Compose `runtime` and one-off `migrate` targets remain supported.

For an existing Docker Render service, use branch `feature/india-grocery-platform`, Dockerfile `backend/Dockerfile` with the backend build context (or `Dockerfile` if Root Directory is `backend`), clear any Docker Command override that runs `npm run db:deploy`, and set:

- Pre-deploy command: `node scripts/migrate-hosted.mjs` (uses direct `MIGRATION_DATABASE_URL`).
- Default Docker start command: `node scripts/start-render.mjs` (uses pooled runtime `DATABASE_URL`).
- Health check: `/ready`.

Pre-deploy commands and persistent disks require the supported paid service plan; review the cost before changing plans. This update does not create or upgrade a service. The default Docker image does not automatically migrate at API startup. On the supported paid baseline, run the migration as a controlled separate deployment step before the API starts.

For the owner's existing **Render Free staging service**, set Docker Command to `npm run start:render`, without shell quotes. This opt-in package script runs `migrate-hosted.mjs` before starting the API and stops if migration fails; it requires no paid pre-deploy command. Keep/set `PORT=10000`; the API binds explicitly to `0.0.0.0` and logs the listening address. Initial migrations can delay port opening; confirm the complete deploy log and HTTP responses instead of assuming a startup message proves readiness. Free local uploads are ephemeral and are unsuitable for durable product imagery. See [port binding verification](../qa/render-port-binding.md).

If Prisma reports “Can't reach database server”, the URL parses but network/database connectivity is unconfirmed. Copy the full current URLs from the correct Neon branch with pooling ON for runtime and OFF for migrations. Confirm the endpoint is active and Neon IP restrictions permit the Render service's outbound IPs. Do not assume a password error or a successful migration from this message. A temporary `connect_timeout=30` URL parameter may help a confirmed cold-start timeout, but does not repair a wrong hostname or blocked networking.

The migration wrapper logs only which setting and hostname it selected. It never logs passwords or the full connection URL. Both database variables and all Clerk settings from section C are required; the three staging mode flags alone are insufficient.
