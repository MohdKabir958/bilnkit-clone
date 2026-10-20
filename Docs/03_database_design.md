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

## Phase 4 delivery operations

`20261020_delivery_operations` adds rider service-zone ownership/last-offered time, DispatchOffer with unique order/rider/round and indexed pending deadlines, order dispatch escalation metadata, expiring delivery OTPs, SupportCase/SupportNote and a leased NotificationIntent outbox. Notification intents cascade with the order; financial/history records keep their existing retention rules. Support records are owned by a User (the compatibility column is named customerId but supports customer/vendor/rider roles). Requester APIs omit note actor identifiers.

`20261020_delivery_handover` adds store pickup-arrival time and removes synthetic ratings/on-time defaults for new rows. It resets only the exact inherited vendor placeholder (4.5 stars/50 ratings); customized historical scores are preserved for operator review. `20261020_real_review_scores` makes absent rider ratings nullable. New product and rider score updates aggregate actual submitted review records under locks rather than reintroducing imaginary prior ratings. Historical missing-input ratings cannot be distinguished retroactively and need operator review before display in a commercial rollout.

Terminal transitions revoke pending offers, consume/release stock as appropriate, stage push intent/audit changes, and remove the rider fix when no active assignment remains. An admin assignment records an accepted manual offer in a new round. Stock, offer and order mutations follow stable lock order; retries cannot produce two assigned riders or restore stock twice. Notification provider failure is outside the business transaction and cannot undo a committed order.

Migration history remains additive. There are 21 migrations including the 15 verified inherited files. Phase 4 schema comparison on the bootstrapped test database reported no difference. The populated development pilot was dumped and restored to an isolated empty database, preserving nine users, two vendors, 80 products and the complete migration ledger. See phase evidence for the final verification commands.

Cloud encoding repair: the original local cluster defaulted to SQL_ASCII. Created a separate UTF-8 database from template0, applied all 21 migrations, cloned disposable test databases and restored the populated pilot into a separate UTF-8 development database. Previous databases were preserved. Unicode migration replay must run on UTF-8; changing historical SQL is not an encoding repair.
