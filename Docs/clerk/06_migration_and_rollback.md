# 6. Database migration, account linking and rollback

Back up the database and record the currently deployed commit/configuration before any existing-data migration. Test first on a separate staging branch/database. Never run `prisma migrate reset`, `db push --accept-data-loss` or demo seed scripts against production.

The additive migration `20261021060000_clerk_identity` adds nullable unique `User.clerkUserId`, identity state and webhook receipts. User UUID primary keys and all business foreign keys remain unchanged. Use `node scripts/migrate-hosted.mjs` with the direct `MIGRATION_DATABASE_URL`; it delegates to the repository's existing controlled migration mechanism.

For existing accounts, an operator must verify ownership independently. **Matching email/phone is insufficient.** Link before the subject's first Grozo request automatically creates a new customer UUID. If a conflict already exists, stop for reviewed reconciliation; the CLI deliberately refuses to merge or steal records.

Run these in the backend directory on the intended environment, after building:

```sh
CLERK_OPERATOR_REFERENCE=verified-migration-ticket node scripts/clerk-identity.mjs link user_EXACT_SUBJECT EXISTING_GROZO_UUID
```

This preserves the UUID and records an audit. Repeating the same association is idempotent; conflicting UUID/subject associations fail. The CLI uses backend credentials and is not a public HTTP endpoint. Do not expose it to untrusted clients.

First owner bootstrap (once per environment; later members use Team & access):

1. Create/verify the intended identity in Clerk and record its exact subject ID.
2. Set backend `CLERK_ADMIN_USER_IDS=user_EXACT_SUBJECT` (comma-separated for several approved operators).
3. For an existing Grozo ADMIN UUID, use `link` above; otherwise provision an explicit administrator:

```sh
CLERK_OPERATOR_REFERENCE=approved-admin-bootstrap-ticket node scripts/clerk-identity.mjs admin user_EXACT_SUBJECT
```

4. Sign in and verify `/api/auth/profile` reports `role=ADMIN`, `adminRole=OWNER` and the trusted ADMIN role and `/api/admin/partners` succeeds only for that administrator. A normal Clerk login must return 403 on admin endpoints.

Before an existing-data Clerk cutover, copy the previous **JWT_SECRET value securely into DELIVERY_PROOF_SECRET**. Old delivery proof receipts used that value for HMAC; replacing it would invalidate them. Do not publish either value. For a fresh staging database, generate a distinct random secret of at least 32 characters. Keep `PAYOUT_ENC_KEY`, Razorpay secrets and Firebase credentials unchanged. Session JWT issuance itself is disabled in Clerk mode.

Production cutover remains pending explicit approval after connected staging/device verification. Deploy matched backend/admin/mobile modes together; never connect a legacy client to Clerk-only APIs expecting automatic fallback. For rollback before cutover, leave `AUTH_MODE=legacy` and the additive schema in place. After cutover, use the recorded application/configuration backup and a reviewed business-data plan; do not drop identity columns/tables or overwrite finance. New Clerk-only users have no legacy password, so switching modes cannot magically make them legacy-login capable.

## Exact coordinated Clerk-only switch — only after owner approval

1. Complete connected staging and physical-device Pass/Fail checks. Record the explicit approval and a rollback ticket. Back up existing data/configuration and freeze conflicting identity edits during controlled linking.
2. Create/configure the separate **live** Clerk instance, its three native clients and stable admin origin. Verify email/Google/recovery and the live signed webhook. Store live secrets only in the backend environment. Preserve the old delivery-proof signing value and all independent finance/payment/Firebase configuration.
3. Apply the additive migration with the direct database URL. Link reviewed existing UUIDs to exact live Clerk subjects through the operator CLI; provision the exact allowlisted administrators. Stop on conflicts.
4. Set Render `AUTH_MODE=clerk`, `NODE_ENV=production`, live `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`, live webhook secret/issuer, exact authorized parties, native no-azp policy and existing production business settings. Production must use its valid Razorpay configuration; the development payment-disabled option is prohibited. Deploy the approved commit.
5. Set Vercel `VITE_AUTH_MODE=clerk`, live publishable key and the exact API/socket HTTPS origins. Regenerate/commit CSP before deployment, then deploy the coordinated admin version. Confirm database ADMIN plus exact allowlist authorization.
6. Build all three owned release apps with native `GROZO_AUTH_MODE=clerk`, native `CLERK_PUBLISHABLE_KEY=<live public key>`, Dart `AUTH_MODE=clerk`, `AUTH_PREVIEW=false`, actual API `/api` URL and Socket.io HTTPS origin. Supply owned signing/Firebase files securely. The test APK builder intentionally rejects live keys; it is not a production release command. From each app directory, the Flutter build is:

```sh
flutter build apk --release --split-per-abi --target-platform android-arm64 \
  --dart-define=AUTH_MODE=clerk --dart-define=AUTH_PREVIEW=false \
  --dart-define=API_BASE_URL=https://ACTUAL-API-HOST/api \
  --dart-define=SOCKET_URL=https://ACTUAL-API-HOST
```

7. Verify missing/invalid sessions return 401, insufficient admin permission returns 403, legacy login/credential routes return 410, expired/revoked sessions and unauthorized rooms fail, and owned business/payment/notification flows pass. Roll out matched clients with an explicit compatibility plan.
8. Only after this succeeds, remove the inactive legacy implementation in a separate reviewed cleanup commit. Keeping inactive compatibility source during this handover is intentional; enabling Clerk mode does not fall back to it.

None of these production activation steps was executed by this implementation.

## Additive admin directory migration

`20261021150000_admin_access` adds AdminAccess and its enums/indexes without replacing User UUIDs or business records. Existing explicitly provisioned allowlisted ADMINs establish their OWNER grant on their next verified request. After this, use Team & access → Add administrator → email; do not add each member to Render. Removing the bootstrap environment entry does not revoke a database grant. Revoke through the portal. The operator CLI remains available for reviewed recovery. A rollback to pre-directory auth would no longer honor portal revocations/invitations: do not roll back authentication code blindly. Keep the additive schema and use a reviewed forward fix.
