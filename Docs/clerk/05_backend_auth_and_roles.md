# 5. Backend identity and permission design

Status: **design only; no Clerk middleware, webhook or database migration has been enabled**.

## HTTP verification

Install the maintained `@clerk/express`; run `clerkMiddleware()` before protected routers. Use supported `getAuth()`/verification APIs for cross-origin Bearer sessions, with configured instance/issuer, authorized parties and applicable audience restrictions. Do not use redirecting `requireAuth()` for JSON APIs, accept a decoded but unverified JWT, or use a development shortcut in deployed code.

Resolve the verified `sub` to Grozo `User.clerkUserId`. The current `req.user` shape can remain `{id, phone, role}` for existing business handlers, but every value must come from trusted database records, not a role claim or body. Recheck deleted/suspended and partner approval state on relevant requests. Return 401 for invalid/missing/expired sessions and 403 for authenticated identities lacking authority; provider/database outages should fail closed with an appropriate service error, without pretending the session was revoked.

Local token signature verification alone cannot guarantee immediate provider revocation. Select and test an online Clerk session/user status check for protected requests and socket revalidation, with an explicit availability/cache policy. Verify revoked session, deleted/banned user and role removal behavior before claiming this requirement. Do not make the old `tokenVersion` comparison an excuse to trust an unrelated Clerk JWT.

The existing per-user rate limiter separately verifies legacy JWTs in `middleware/rateLimit.ts`. Migrate it to a verified Clerk/internal identity; keep IP limits for unauthenticated requests. Upload endpoints have conditional inline role and approval checks. Inventory shows them but does not prove their semantics.

## Business authority

| Identity | Trusted Grozo authority |
| --- | --- |
| New customer | First-request provisioning keyed by Clerk subject; internal STUDENT compatibility value; private addresses/orders/devices owned by that UUID. |
| Vendor applicant | Explicit authenticated application; new business profile PENDING. No store claimed from email, phone, client role or arbitrary vendorId. |
| Approved vendor | Database role AND approved store association; each product/order/inventory change checks that associated store. |
| Rider applicant | Separate authenticated application and pending rider profile, never automatically approved because the app is the rider app. |
| Approved rider | Database role, current approval/duty, dispatch eligibility and actual assigned order; GPS and delivery verification remain assignment scoped. |
| Admin | Explicit operator-provisioned Clerk subject plus approved trusted internal ADMIN record. No self-service promotion or metadata authority. |

Define `CLERK_ADMIN_USER_IDS` as an operator-controlled bootstrap input, not a frontend variable or a public API parameter. Provision/link only those exact subjects transactionally and audit the operation. Specify how an operator revokes admin authority; normal first-request provisioning and webhooks must never promote roles.

## Verified webhooks

Add the endpoint only with the supported Clerk signature verifier and `CLERK_WEBHOOK_SIGNING_SECRET`. Preserve exact request bytes before JSON parsing as required by that verifier. Do not share the Razorpay signing secret or weaken its existing independent verification.

Store delivery/event identifiers under a unique constraint and apply identity updates transactionally. Keep a per-subject provider version/timestamp and deletion tombstone so a duplicate is harmless and an old update/create cannot resurrect a deleted account. Define deterministic tie handling. Webhooks may synchronize necessary verified identity attributes but never role/approval/ownership. A first authenticated request must safely provision without waiting for a webhook; concurrent provisioning must be subject-unique and idempotent.

Do not claim an old account on email/phone match. Identity-field uniqueness conflicts need explicit resolution without reassociation. Deleted users must lose access synchronously in Grozo, including devices/sockets; provider deletion/revocation retries and webhook reconciliation preserve financial records and current privacy policy. User deletion must not cascade-delete orders/refunds/settlements.

## Socket.io

Replace `verifyTokenForAccount` only after the SDK session path is proven. Authenticate handshake using the official verifier and trusted DB mapping; schedule expiry and provider revocation/status rechecks. Recheck ownership/approval for room joins, events and recipient fanout; disconnect or remove rooms when authority changes.

Keep `user_<UUID>`, `admins`, `drivers`, `vendor_<UUID>` and `order_<UUID>` compatibility room names. Customers may watch only owned orders, vendors only associated approved stores and authorized paid order views, riders only their private offers and assignments. Preserve join limits, per-viewer redaction, on-duty checks, tracking eligibility and suspension disconnects. Clerk login alone grants none of these rooms.

Razorpay HMAC/idempotency, payout encryption, FCM device ownership, stock reservations, order transitions, refunds and settlements remain independent invariants. They have not been modified in this stage.
