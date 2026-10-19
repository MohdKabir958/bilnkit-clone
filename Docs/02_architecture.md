# Architecture and role boundaries

The retained architecture is Express/TypeScript + Prisma + one PostgreSQL database, one React operations website, and three Flutter apps. Socket.io supplies live state; FCM supplies mobile push; Razorpay supplies configured online payments. No replacement backend or admin mobile app has been introduced.

All clients use `/api` REST endpoints and JWT bearer authentication. The internal customer role is currently `STUDENT`; this is legacy compatibility, not a claim of generalized customer onboarding. `middleware/auth.ts` validates account existence, token version and partner eligibility. Resource owners are checked in order/catalog services. Room joins and per-viewer order serialization are enforced in `realtime.ts` and `services/orderView.ts`.

| Role | Current authorized surface |
|---|---|
| ADMIN | Partner approval/accounts, catalog moderation, operations, finance, reassignment |
| VENDOR | Owned store/menu, owned orders, payout details and settlements |
| STUDENT (customer) | Own profile/orders/checkout/tracking/reviews |
| DRIVER | Eligible pool, assigned deliveries, own earnings and authorized tracking |

Phase 2 must introduce backend-validated structured addresses and enabled geography. Phase 3 must extend MenuItem compatibility into grocery products/variants and transactional inventory. Phase 4 must tighten assignment offers, location retention, support, observability and deployment. These planned features are not represented as implemented architecture.

Local `PAYMENT_PROVIDER=disabled` is allowed only with `NODE_ENV=development`. It cannot produce a paid order; payment callbacks fail closed. Jest's injected payment simulator is isolated from the normal entrypoint. Production continues to require gateway credentials.
