# Deployment and recovery

No production database, live payments, authentication cutover or paid resources were changed during this work. Preserve the deployed authentication mode and secrets until a separately approved rollout. The supported `render.yaml` baseline uses **paid Render Starter and a persistent disk**; review current Render pricing before creating it. Do not apply that Blueprint merely to fix a free preview.

## Database

Use a separate Neon database/branch for staging. Enter credentials securely in Render, never in Git or a mobile bundle:

| Variable | Value source |
| --- | --- |
| `DATABASE_URL` | Neon pooled PostgreSQL connection, TLS required. For one API instance use a small bounded Prisma pool, e.g. `connection_limit=5&pool_timeout=10`. |
| `MIGRATION_DATABASE_URL` | Neon direct connection to the **same database/branch**, pooling off, TLS required. |

Copy URLs directly from Neon without shell wrappers or surrounding quotes. Percent-encode special password characters. Never overwrite historical migration files or run `prisma migrate reset`/`db push --accept-data-loss` against deployed data. Back up first; migrations are additive and preserve UUID relationships. The partial-refund submission column deliberately treats previously attempted submissions conservatively.

Run controlled migrations with `node scripts/migrate-hosted.mjs` from `backend`. `/ready` now probes required schema columns, migration completion, public uploads and separate private evidence storage. A reachable empty database must fail readiness.

## Render

Build: `npm ci --include=dev && npx prisma generate && npm run build`.

Paid supported deployment: pre-deploy `node scripts/migrate-hosted.mjs`, start `node scripts/start-render.mjs`, health check `/ready`, one instance, manual deploy. On a free Docker **staging preview**, the existing package command `npm run start:render` performs migrations before startup; avoid nested shell quoting in Render's Docker Command. Both scripts must be included in the built image. Free-instance local files are ephemeral and are unsuitable for retaining product uploads/private evidence in production.

Persistent disk layout in the Blueprint:

```text
/var/data/grozo/uploads                 UPLOAD_DIR (public product images)
/var/data/grozo/private/support-evidence SUPPORT_EVIDENCE_DIR (private)
```

Both directories must be writable by the runtime user. Private evidence must be outside the public directory, including after resolving symlinks. The Docker default pre-creates separate node-owned public/private directories. Persistent disk ownership and restoration on Render still require deployment verification.

Set `ADMIN_URL` to the exact Vercel origin, e.g. `https://grozo-admin.vercel.app`, and `PUBLIC_BASE_URL` to the API origin. Use exact origins without trailing slashes for Clerk authorized parties. Public API metadata is at `/api/config`; protected operator diagnostics are at `/api/admin/diagnostics/configuration`. A deployment mismatch returns 409 and preserves the session for recovery.

For an approved Clerk staging instance, use the templates and instructions under `Docs/clerk/`: `AUTH_MODE=clerk-test`, `NODE_ENV=development`, `GROZO_ENV=staging`, matching `CLERK_PUBLISHABLE_KEY`, server-only `CLERK_SECRET_KEY`, Clerk-derived `CLERK_ISSUER`, verified webhook signing secret, exact `CLERK_AUTHORIZED_PARTIES`, explicitly provisioned initial administrator and the native-client policy. Do not switch a production service to development settings to bypass configuration validation. Keep Clerk test/live instances isolated.

`DELIVERY_PROOF_SECRET` must contain at least 32 random characters; `openssl rand -hex 32` generates a suitable server value. `PAYOUT_ENC_KEY` is **32 random bytes encoded as base64** (`openssl rand -base64 32`). Back up the encryption key securely; regenerating it makes existing encrypted financial details unreadable. These independent keys are not Clerk keys.

Razorpay must have genuine matching mode/key/webhook settings. `PAYMENT_PROVIDER=disabled` is appropriate only for the allowed isolated development/staging configuration; it cannot collect online payments. COD additionally needs city approval. Firebase stays FCM-only: configure an owned service-account secret using `FIREBASE_KEY_PATH` or `FIREBASE_SERVICE_ACCOUNT` and matching Android client files. Missing FCM configuration is reported honestly, not treated as successful delivery.

Optional packing/capacity configuration remains bounded: `VENDOR_ACCEPT_WINDOW_MIN`, `DISPATCH_EXPECTED_MATCH_SECONDS`, `PICKUP_EARLY_WAIT_SECONDS`, `NO_RIDER_RECOVERY_MINUTES`, `CAPACITY_COD_QUEUE_ENABLED`, `CAPACITY_MAX_QUEUED_ORDERS`, `DELIVERY_SERVICE_PAUSED`. Leave constrained COD queues disabled unless the operator has staffed recovery. Routing endpoints/tokens require an owned licensed provider; absent configuration uses labelled estimates.

## Admin on Vercel

Root directory is `web/super_admin`; framework Vite; build `npm run build`; output `dist`. Set the existing `VITE_AUTH_MODE`, `VITE_API_BASE_URL` (API origin without `/api`) and, for Clerk, `VITE_CLERK_PUBLISHABLE_KEY`. Never enter backend secrets as `VITE_*` values. Generate/check the hosted CSP with `scripts/configure_hosted_admin.mjs` using the actual backend and Clerk publishable key. CSP allows exact Clerk, API/WebSocket and required challenge/worker resources; it must not be replaced with wildcard origins.

Redeploy after build-time environment changes. Verify route refresh, fresh bearer retrieval/reconnect, exact backend CORS origin and denial of unapproved administrators. Local mocked tests do not prove a hosted Clerk session or Vercel deployment.

## Backups and isolated recovery

Use a private directory outside public uploads and copy encrypted backups to operator-controlled storage. Archives contain personal/financial records and must never enter Git or public artifact branches.

```bash
# DATABASE_URL is already set securely in the operator's shell.
node scripts/database_recovery.mjs backup /private/grozo-backups
python3 scripts/upload_recovery.py backup /configured/uploads /private/grozo-backups/uploads.tar.gz
python3 scripts/upload_recovery.py backup /configured/private-evidence /private/grozo-backups/evidence.tar.gz
```

For a drill, create a **new empty** database ending `_restore_test`, set `RESTORE_DATABASE_URL` securely and run `node scripts/database_recovery.mjs restore /private/grozo-backups/archive.dump`. The tool rejects the source database, non-isolated names and existing tables; validates checksums; uses transactional `pg_restore`; and never puts passwords in command arguments. File restores likewise require a new empty directory ending `_restore_test`, validate each file and reject links/path traversal/overwrites.

After restoration compare identity mapping, orders/payments/refunds, stock, migration checksums and upload references, then test `/ready`, a private evidence request and an authorized catalog/order. The local drill is evidence of tool behavior, not a configured Neon backup schedule, off-site retention or a measured production RPO/RTO. Operators must set retention and actually perform a hosted recovery drill before live rollout.
