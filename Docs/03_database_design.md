# Database design and migration safety

Current schema: `backend/prisma/schema.prisma`. Existing entities include User, Vendor, MenuItem, Category/VendorCategory, Order/OrderItem/OrderGroup, Payment, DriverPartner/DriverLocation, DeviceToken/PushLog, AdminAuditLog, AppSetting, PayoutAccount, Settlement/SettlementAdjustment and RiderPayout. Existing owner foreign keys and order/payment indexes are retained.

## Historical migration defect and fresh installations

The inherited history starts with `20260904_align_legacy_schema` (ALTERs on absent tables), followed by an OTP cleanup and then the initial CREATE migration. Plain `prisma migrate deploy` fails on an empty database. Applied historical migration files have not been edited or renamed.

Use `npm run db:deploy` in `backend`. On a genuinely empty public schema, `scripts/migrate.mjs` verifies the 15 historical migration hashes against `prisma/baseline/manifest.json`, applies `prisma/baseline/schema.sql` generated from the inspected schema, records those exact historical migrations as applied using Prisma's supported resolve command, then deploys later migrations normally. On an existing tracked database it only deploys pending migrations. It refuses an existing untracked schema rather than silently baselining user data.

This is a fresh-install bridge, not a repair tool for a partially failed migration. If interrupted during initial bootstrap or if existing tables/types have no migration ledger, stop, back up and inspect. Do not automatically mark a failed migration applied. The initial failed disposable `kraveo_test` database was left untouched; validation uses a new `market_test` database.

A fresh `market_dev` database was bootstrapped, a second deploy was a no-op, and Prisma drift comparison reported no difference. No production database was accessed. No business schema models were added in this baseline change. Later feature migrations must be additive and must not rewrite the baseline's historical manifest.

Before production: back up existing installations, compare actual schema with the historical baseline, review any drift, restore-test the backup and rehearse pending migrations on a copy. Roll back application code only when schema compatibility permits; destructive downgrade SQL is not supplied.

## Phase 2 geography

Additive migration `20261019_india_serviceability` adds City, DeliveryZone, VendorCoverage and owned Address records; city/approval/location discovery index; store hours and immutable Order.addressSnapshot. Database constraints enforce Indian coordinate bounds, six-digit PINs, positive circle radii and nonnegative integer delivery charges. A partial unique index permits only one default address per account; account-row locks serialize default changes. Empty-database bootstrap still uses the original baseline and then applies new migrations.

Checkout locks the owned address, enabled city, store, zone and coverage while repricing. PIN matching is not a delivery rule: configured circles and store radius determine eligibility. Historical delivery labels remain readable but cannot authorize new checkout.

## Phase 3 grocery inventory

Migration `20261020_grocery_inventory` extends each MenuItem into one sellable SKU/pack, with store-scoped SKU uniqueness, a productKey grouping related variants, measurement unit/pack quantity, optional MRP/barcode/HSN, tax metadata, image URLs, available stock, stock version and low-stock threshold. Existing items start at **zero** available stock; operators must count inventory before sale. Category remains a managed database relation. Existing Float rupee columns remain compatible with finance/history; all new input, arithmetic and product snapshots use integer paise, with conversion only at these legacy persistence/API boundaries.

InventoryReservation is unique per order/SKU. Checkout locks all relevant old/new SKU rows in sorted order, reprices within its transaction, decrements available stock with a conditional update and writes HELD reservations plus stock movements. A failed child of a split checkout rolls the entire transaction back. Order item snapshots preserve SKU, pack/unit, MRP, inclusive-tax metadata and unit paise. Public views omit internal vendor unit proceeds.

Eligible cancellation/expiry releases HELD inventory once; delivery marks it CONSUMED. Cancellation after pickup records LOSS without returning physical goods to available stock. Stock movements contain immutable reasons, actor IDs and unique operation references. Count adjustments require a matching stockVersion and a stable request ID; stale edits return conflict, retries of the same request do not apply twice.

The follow-up `20261020_grocery_price_guard` database check prevents every writer, including inherited imports/repricing, from setting a selling price above configured MRP. Named constraint failures return a stable field error without SQL details.
