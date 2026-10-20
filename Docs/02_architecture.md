# Architecture and API boundaries

The implementation retains one Express/TypeScript API, Prisma/PostgreSQL database, React Super Admin website and three Flutter apps. Socket.io delivers live changes; Firebase Cloud Messaging delivers push; the existing Razorpay adapter handles configured gateway payments. Firebase is used for messaging, not the application database or account authority. No admin mobile app or replacement commerce framework was introduced.

## Accounts and ownership

The internal customer role remains `STUDENT` for database/API compatibility. Registration no longer classifies customers as university students or restricts their location to a campus. Customer authentication uses backend-verified Google ID tokens; vendor/rider accounts use scrypt password hashes and admin approval. Admin login requires a configured private passcode. JWTs expire after eight hours for admins and seven days for other roles; account token versions revoke sessions. Mobile JWTs migrate once from preferences into platform-protected storage, and Android account backup is disabled. Admin website tokens remain session scoped; use a trusted workstation and operator-reviewed access policy.

| Role | Authorized resources |
|---|---|
| Admin | Partner onboarding/status, customers, cities/zones/coverage/hours, products/moderation/stock, order intervention, operational reports, support/audit, payment/refund and manual payout ledgers |
| Vendor | Its own store/products/stock, store orders, sales, payout destination and settlements, own support requests |
| Customer | Its own profile, saved addresses, serviceable catalog/quotes/checkout, orders, tracking, reviews and support requests |
| Rider | Personal offers, assigned delivery operations, own history/payout information and support requests; GPS only during an active assignment |

Object ownership is checked on the server. Unoffered riders cannot read another delivery by guessing its ID. Stores and unassigned riders receive coarse locality/city information; exact saved delivery addresses and customer phone numbers are available only to the customer, admin and currently assigned active rider. A completed rider history retains commercial trip information without the customer address or phone. Socket room joins are authenticated; client-supplied user IDs cannot select another account's room.

## Geography, catalog and checkout

A customer selects an owned structured Indian address. Nearby discovery checks enabled cities, configured circles, vendor coverage, store location and opening hours. PINs identify postal areas and do not replace coordinates. Unsupported locations are rejected again inside checkout's transaction. Manual address entry and a one-time customer GPS fix work without geocoding credentials. Optional HTTPS Photon-compatible search and OSRM-compatible routing are configured through server adapters; public OSM services are not a production default.

Each MenuItem row is one sellable grocery SKU/pack. Related variants share a store-scoped productKey. Categories are managed database records. Search and cursor pagination avoid a fixed product limit. Product metadata, MRP, stock versions, movements and immutable order snapshots are persisted. A vendor can upload validated raster product photos or provide permitted HTTPS URLs. The default storage adapter uses a persistent upload volume served through the configured public HTTPS origin; back up that volume separately from PostgreSQL. No S3 deployment or CDN integration is claimed.

Checkout prices in integer paise, validates stock, locks SKUs in stable order and atomically reserves inventory. Eligible cancellation releases reservations once; delivery consumes them; cancellation after collection records loss without making goods available again. Existing split orders are retained: all stores must serve the same selected address, every child must be paid/accepted, and the group is assigned/refunded/delivered atomically. Quotes show all charges before payment. Historical rupee Float columns remain compatible at persistence boundaries; calculations and SQL financial aggregations operate on integer paise.

## Delivery and durable notifications

Dispatch uses approved, idle, online riders whose admin-configured service circle covers all pickups and the destination. Each round offers up to three riders in least-recently-offered order. Offers have a server deadline (45 seconds by default); decline/timeout tries another eligible candidate. One pending offer per idle rider and one per order are enforced under rider/order locks. Unserved/exhausted orders appear in Operations, where an admin can retry or open the existing assignment/cancellation controls. Offline, suspension, cancellation and reassignment revoke pending offers. Admin assignment checks territory and records manual assignment history/audit.

The rider confirms arrival at the store and collection. Arrival at the destination issues a four-digit delivery code with ten-minute expiry, five-attempt lockout and single-use verification. An admin may rotate an expired/locked code after investigating; no code appears in FCM or rider responses. Existing enum names such as ARRIVED_AT_GATE are retained as compatibility names for doorstep arrival.

Location writes validate the rider, Indian coordinates, active assignment and update frequency. Only the owning customer and admin receive active fixes. Completion/cancellation removes the fix; maintenance removes stale/unauthorized fixes after five minutes. Mobile streaming starts after assignment and stops when the job ends, including when the rider remains online for new work. Offline availability can coexist with finishing an already assigned delivery.

NotificationIntent rows commit with business transitions/offers. A leased worker dispatches through the retained Firebase Admin SDK, with PushLog claims, retry/backoff, stale-event suppression and dead-token cleanup. Replaying a completed intent is deduplicated; delivery has at-least-once semantics when a process dies between provider acceptance and recording that outcome. Unconfigured providers leave pending intents visibly unconfigured until their useful window expires. FCM registration binds a token permanently to its original account; switching accounts rotates the token. All three apps recover a DEVICE_TOKEN_OWNED conflict by requesting a fresh FCM token. Payload data contains only event/order ID/version, never JWT, OTP, street or phone.

## Principal API additions

All paths below are under `/api`. Existing authentication and supported compatibility endpoints remain available. Order and geography/product changes are server authorized regardless of client version.

| API | Caller and purpose |
|---|---|
| `/v1/cities`, `/v1/addresses`, `/v1/addresses/:id/default` | Customer geography and owned address management |
| `/v1/vendors/nearby`, `/v1/serviceability` | Owned-address serviceability/discovery |
| `/v1/maps/search`, `/v1/orders/:id/route` | Authenticated optional geocoding/authorized route |
| `/v1/vendors/:id/products`, `/v1/products/:id` | Paged catalog, variants and owner-managed SKUs |
| `/v1/products/:id/stock`, `/stock-movements` | Versioned/idempotent counted stock and history |
| `/v1/partner/uploads/image?purpose=dish` | Approved vendor raster image upload, max 1 MB, bounded dimensions and quota |
| `/orders/available?groups=1`, `/orders/:id/accept-driver` | Personal offers and atomic acceptance |
| `/v1/dispatch-offers/:id/decline`, `/v1/orders/:id/arrive-pickup` | Rider decline and store-arrival confirmation |
| `/v1/support-cases`, `/:id`, `/:id/replies` | Requester-owned cases and paged private conversation |
| `/v1/admin/geography`, `/cities`, `/zones`, `/vendors/:id/location`, `/vendors/:id/coverage/:zoneId` | Admin geography/hours/fees |
| `/v1/admin/drivers/:id/service-area`, `/dispatch`, `/orders/:id/dispatch/retry` | Admin service area and dispatch intervention |
| `/v1/admin/operations`, `/support-cases`, `/support-cases/:id/notes`, `/audit` | Real PostgreSQL metrics, support replies/status and paged business history |

Cursor endpoints return `nextCursor`; the requester support detail returns `nextNotesCursor`. Operational metrics count orders created in the selected 1–90 day period and filter by store city. Finance reports use their documented delivered/refund calendar rather than conflating a created-order cohort with cash receipts. Customer support requests can be linked to an owned order. An operator approves an eligible refund, executes the existing audited cancellation/refund action, then resolves the case. Recording a support note alone does not move money. Post-delivery quality claims need operator review; no unapproved automatic credit is created.

## Deployment boundaries

`PAYMENT_PROVIDER=disabled` works only in development and cannot manufacture a paid order. Jest injects explicitly named test-only payment/FCM transports while exercising real APIs and PostgreSQL. Real Google OAuth, Razorpay sandbox and owned-project FCM delivery still require owner configuration and independent validation.

The supplied pilot deployment uses one API instance behind HTTPS with a private database and persistent uploads. Rate-limit windows, socket publication and auth-cache invalidation are process-local; do not scale to multiple API instances until shared rate limiting, Socket.io coordination and cross-instance session revocation are implemented and tested. Automated vendor/rider disbursement is not connected: settlements and payout entries are verifiable operational records, not proof of a bank transfer. Rider delivery-fee estimates and actual recorded payouts remain distinct.

Geography supplies the per-store delivery base/rate. Global free-delivery thresholds apply to the whole checkout; a small-order surcharge applies once to a split checkout. Quotes and committed child charges use identical integer-paise calculations. Stored fee snapshots do not change when settings change. Vendor order product snapshots include catalog metadata without customer retail price, MRP or internal commission figures; customer snapshots exclude vendor proceeds.

Approved vendor profile management is connected under Help → Store profile (`GET/PUT /api/v1/partner/store`). Owners edit their own name, pickup-address label and HTTPS banner; city/PIN/schedule/area remain operator-managed. Changing the pickup address disables the store's coverage atomically until operations reconfirms coordinates/coverage. Unknown/admin fields and duplicate names are rejected; changes are audited and retries preserve app edits. Product, location and payout controls remain available separately.

The store-profile PUT accepts only `name`, `address` and `bannerImage`; the store is resolved from the authenticated owner. Its response includes `data`, `changed` and `coverageNeedsReview`. A changed pickup address disables coverage in the same transaction, and only admin coverage management can restore serviceability. GET exposes no commission, payout or other stores' records.
