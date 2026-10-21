# 7. Neon, Render and Vercel deployment worksheet

Status: **no deployment or resource creation performed; existing deployment configuration is unchanged**. The templates in `templates/` describe the intended Clerk cutover and cannot boot the current legacy backend by themselves.

## Environment variable ownership

| Variable | Where entered after cutover | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Render backend secret environment | Neon pooled runtime URL with TLS and reviewed connection limit. |
| `MIGRATION_DATABASE_URL` | Render controlled pre-deploy environment | Neon direct URL with TLS; separate from pooler. |
| `CLERK_PUBLISHABLE_KEY` | Backend environment; mobile public build configuration | Environment-specific public Clerk instance key. |
| `CLERK_SECRET_KEY` | Backend secret environment only | Server-side Clerk verification/API operations. Never Vite/Flutter. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Backend secret environment only | Clerk webhook signature verification; separate from Razorpay. |
| `CLERK_AUTHORIZED_PARTIES` | Proposed backend setting | Exact reviewed session parties, including admin origin; native token claims need real SDK verification before choosing their policy. |
| `CLERK_ISSUER` | Proposed backend setting | Exact expected instance issuer; must match tested SDK verification behavior. |
| `CLERK_ADMIN_USER_IDS` | Proposed operator-only backend/bootstrap setting | Explicit approved subject IDs; never client role assignment. |
| `ADMIN_URL` | Render backend environment | Exact Vercel origin for CORS/socket origin checks. |
| `PUBLIC_BASE_URL` | Render backend environment/start wrapper | Actual public HTTPS API origin, including upload URLs. |
| `UPLOAD_DIR` | Render backend environment | `/var/data/grozo/uploads` on persistent disk. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Vercel project environment | Public key for the same environment/instance as the backend and apps. |
| `VITE_API_BASE_URL`, `VITE_SOCKET_URL` | Vercel project environment | Exact Render HTTPS origin; no `/api` suffix in the admin base URL. |
| `API_BASE_URL`, `SOCKET_URL` | Mobile public build definitions | API URL includes `/api`; socket URL is the origin. Use actual HTTPS endpoints on phones, not emulator `10.0.2.2`. |

`CLERK_*` names designated proposed above are design inputs, not implemented runtime parsing. Current backend still requires `JWT_SECRET` and `ADMIN_PASSCODE`; do not delete those from a running service until coordinated cutover is tested. Keep `PAYOUT_ENC_KEY`, Razorpay secrets and Firebase configuration independently.

## Neon

The existing `backend/scripts/migrate-hosted.mjs` selects `MIGRATION_DATABASE_URL` for migration execution and preserves `DATABASE_URL` for runtime. `migrate.mjs` audits legacy baseline checksums, bootstraps only empty schemas and refuses an untracked existing schema. Keep this mechanism.

Use Neon-provided TLS URLs. Runtime should use a pooled connection and a bounded Prisma `connection_limit` appropriate to one Render instance (a starting worksheet value is 5; verify actual load/Neon plan). Use the direct URL for migration deploy. Do not run `db push --force-reset`, `migrate reset`, truncate or destructive migration commands on a hosted database.

Verify migration status, nullable/unique subject association, preserved UUID/foreign keys, conflicts/idempotency and webhook versioning in an isolated staging database before touching any production data. No hosted schema verification was performed here.

## Render

Keep the existing Node/Express/Socket.io paid **Starter + 1 GB persistent disk** Blueprint baseline, single instance, `/health`, `/ready`, safe migration pre-deploy and the persistent upload directory. These resources incur recurring paid costs; current regional pricing must be reviewed and explicit authorization obtained before provisioning. This task did not incur cloud costs.

After cutover update `render.yaml` and startup config to require Clerk settings in place of obsolete auth secrets. Retain payment encryption/signatures, notification settings, TLS, origin checks and release configuration. Test health/readiness, an unauthenticated 401, authenticated customer access, non-admin 403, owned uploads and authenticated sockets after reconnect.

An isolated staging environment should use genuine Razorpay **test-mode** keys and webhook signing secret in secrets settings. Do not fabricate keys, use live money, or loosen production validation. The existing payment-disabled mode is for `NODE_ENV=development` only and is not a hosted production bypass.

## Vercel

Import the single admin project with **Root Directory `web/super_admin`**, framework **Vite**, build **`npm run build`**, output **`dist`**. Preserve SPA rewrites. Add public Vite settings, then configure exact Clerk redirect/origin and Render CORS settings for that URL. No Secret Key belongs in Vercel's frontend bundle.

Update the existing CSP generation/configuration only after observing the selected Clerk UI resource origins. Permit required exact Clerk hosts and Render HTTPS/WSS, not `*` or blanket third-party subdomains. Verify sign-in/Google callbacks, route refresh, refresh-token behavior and admin denial for a normal customer in a real browser. None of these deployment checks is complete.
