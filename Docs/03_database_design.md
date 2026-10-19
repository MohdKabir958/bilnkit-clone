# Database design and migration safety

Current schema: `backend/prisma/schema.prisma`. Existing entities include User, Vendor, MenuItem, Category/VendorCategory, Order/OrderItem/OrderGroup, Payment, DriverPartner/DriverLocation, DeviceToken/PushLog, AdminAuditLog, AppSetting, PayoutAccount, Settlement/SettlementAdjustment and RiderPayout. Existing owner foreign keys and order/payment indexes are retained.

## Historical migration defect and fresh installations

The inherited history starts with `20260904_align_legacy_schema` (ALTERs on absent tables), followed by an OTP cleanup and then the initial CREATE migration. Plain `prisma migrate deploy` fails on an empty database. Applied historical migration files have not been edited or renamed.

Use `npm run db:deploy` in `backend`. On a genuinely empty public schema, `scripts/migrate.mjs` verifies the 15 historical migration hashes against `prisma/baseline/manifest.json`, applies `prisma/baseline/schema.sql` generated from the inspected schema, records those exact historical migrations as applied using Prisma's supported resolve command, then deploys later migrations normally. On an existing tracked database it only deploys pending migrations. It refuses an existing untracked schema rather than silently baselining user data.

This is a fresh-install bridge, not a repair tool for a partially failed migration. If interrupted during initial bootstrap or if existing tables/types have no migration ledger, stop, back up and inspect. Do not automatically mark a failed migration applied. The initial failed disposable `kraveo_test` database was left untouched; validation uses a new `market_test` database.

A fresh `market_dev` database was bootstrapped, a second deploy was a no-op, and Prisma drift comparison reported no difference. No production database was accessed. No business schema models were added in this baseline change. Later feature migrations must be additive and must not rewrite the baseline's historical manifest.

Before production: back up existing installations, compare actual schema with the historical baseline, review any drift, restore-test the backup and rehearse pending migrations on a copy. Roll back application code only when schema compatibility permits; destructive downgrade SQL is not supplied.
