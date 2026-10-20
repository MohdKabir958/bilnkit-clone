# Controlled pilot deployment and rollback

No production deployment, public DNS/certificate activation, live charge or automated disbursement was performed. The repository supplies a pilot configuration; external services, Android devices and legal/operator approval remain launch gates.

## Prepare and rehearse

Use `deploy/compose.production.yaml`, `deploy/Caddyfile` and `deploy/.env.production.example`. The development root Compose file uses loopback trust authentication and is unsuitable for production. The production example keeps PostgreSQL private, serves the admin build and API through Caddy HTTPS/WSS, runs the API as an unprivileged user with a read-only root and persistent upload volume, and has a one-off migration target.

1. Provision an owned host/database and DNS name. Pin reviewed container digests for the actual release. Limit host access, enable disk encryption and restrict SSH/backup access. This configuration assumes one API process; horizontal scale requires shared session invalidation, rate limits and socket coordination.
2. Copy the production environment example to an ignored `deploy/.env.production`, mode 0600. Use unique JWT (32+ characters), admin (20+ characters), database and payout-encryption keys. URL-encode database passwords. Set explicit HTTPS ADMIN_URL and PUBLIC_BASE_URL origins; optional CLIENT_URL must be an owned HTTPS origin. Production refuses disabled payments and missing gateway configuration. Use only reviewed provider modes/credentials.
3. Supply an owned Firebase service account at the ignored `deploy/secrets/firebase.json`, readable by container UID 1000. Configure customer Google OAuth and Razorpay test mode first. Do not use inherited project identities, place server keys in apps, or put private keys in Vite/Dart definitions. Follow `07_external_services.md`.
4. Build the admin in `web/super_admin` with frozen dependencies. Same-origin API/socket defaults work through the supplied gateway; configure VITE_API_BASE_URL/VITE_SOCKET_URL only for an explicitly owned separate origin. Configure licensed map tiles if enabling the production map.
5. Build the API image with target `runtime`; build the `migrate` target for the one-off job. Both retain TLS/package integrity checks. The optional BuildKit `build_ca` secret supports an approved corporate proxy CA during dependency installation; it is not baked into the runtime. Cloud proxy host resolution is environment-specific and is not a production network setting.
6. Start only the database. Back up an existing database and uploads, restore that backup into a separate empty database, and rehearse `npm run db:deploy` there. Inspect its ledger and drift. The fresh bootstrap refuses an existing untracked schema; never reset or automatically resolve a failed production migration.
7. After explicit deployment authorization, run the one-off migration service, then start the API and gateway. Suggested commands from the repository root, after the previous checks: `docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml --profile maintenance run --rm migrate`, then `... up -d api gateway`. These commands are documentation; they have not been executed against production.
8. Verify `/health`, `/ready`, admin authentication, authenticated geography/catalog requests and a real sandbox order. Test CORS and WebSocket rejection for unowned origins, secret redaction, account revocation, cancellation/refund, driver reassignment and tracking termination. A listening process or successful build does not establish these behaviors.

The Dockerfile's runtime target has been built locally with the pinned Node runtime. Migration/schema, restore and application workflow evidence is recorded separately; Caddy public TLS and a production restart/rollback rehearsal still require an owned staging host.

## Backups and incident recovery

`scripts/backup_database.sh /private/backup-directory` uses DATABASE_URL to create a mode-restricted PostgreSQL custom-format dump plus checksum. Use a PostgreSQL client version at least as new as the server. It validates the archive list; this does not replace restoration testing. Run it on an operator-owned schedule, encrypt off-host copies and alert on stale/missing backups. Back up the upload volume at the same point, including immutable product images, and preserve the environment encryption key separately so bank destinations can be decrypted after recovery.

For a **new empty isolated** target whose database name ends `_restore_test`, set RESTORE_DATABASE_URL and run `scripts/verify_database_restore.sh /private/backup.dump`. It refuses a nonempty target, restores with errors fatal and prints only entity counts. Validate critical row counts, a representative order/payment/stock history, uploaded photos and migration drift. The local populated pilot restoration passed; neither script overwrites an existing database.

If an application release fails, stop new checkout/dispatch traffic and preserve logs and payment identifiers. Deploy the previous reviewed image only if it is compatible with the additive schema, then verify readiness and reconcile pending payments/refunds/outbox work. Do not roll back recorded financial effects or truncate inventory/dispatch tables. A database restore is a separate incident procedure: stop writes, establish the recovery point, restore into a new database, reconcile post-backup gateway activity and only then switch traffic with operator approval. Keep the failed database available for investigation.

## Monitoring

Monitor HTTPS availability, `/ready`, database space/connections, backup age/restore results, upload quota, process restarts, HTTP 5xx/429 rates and latency. Alert operators on dispatch NO_ELIGIBLE_RIDER/OFFERS_EXHAUSTED, locked/expired OTPs, old paid PLACED orders, failed/exhausted refunds, gateway reconciliation discrepancies, stuck PENDING notification leases, failed/dead FCM tokens and unresolved support cases. The admin Operations and Needs attention screens expose real business records; they do not replace an alert delivery service. Configure an owned uptime/log destination before launch; none is automatically provisioned.

The gateway emits structured access logs and the backend records business audits/error codes. Avoid request-body/header logging, query-string credentials, FCM token dumps, customer addresses and OTPs. Rotate logs and define audited access/retention with legal advice. Retention maintenance deletes inactive/stale rider fixes, and order completion removes the active fix immediately.

## Android artifacts

`bash scripts/build_mobile_apks.sh` requires owned HTTPS API_BASE_URL (ending `/api`), SOCKET_URL, GOOGLE_SERVER_CLIENT_ID and release keystore environment variables ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD. Configure matching owned Firebase client JSON for each generated application ID. Release Gradle tasks refuse missing signing credentials and reject the debug-only disableFirebase flag. Do not distribute the generated debug APKs as production releases.

Local debug validation may explicitly set ORG_GRADLE_PROJECT_disableFirebase=true when no owned project is configured. That APK cannot establish real FCM delivery. Verify fresh install/update, OAuth, notification permission/token refresh/account switch, vendor alarms, gallery upload, active/background location, reconnection, navigation, OTP expiry/lock/reset and Play policy on physical Android devices. This checkout has no iOS native project or Apple build environment; shared Dart remains cross-platform, but an iOS release is not verified.

## Render / Neon / Vercel and phone downloads

The provider-specific configuration and handover route are in [hosted deployment and APK handover](11_hosted_deployment_and_apk_handover.md). The root `render.yaml` uses a paid persistent-disk service and a direct Neon migration connection. The admin's obsolete upstream Vercel API rewrite has been removed; configure its actual API/CSP origin before deploying. Phone previews use the deployed HTTPS origin and GitHub artifacts rather than cloud-workspace file links. These configuration files are prepared and locally checked; no provider deployment is implied by their presence.
