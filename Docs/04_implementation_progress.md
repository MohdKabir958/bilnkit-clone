# Implementation progress

| Phase | Status | Evidence / gate |
|---|---|---|
| 1 — audit, run, baseline repairs | Acceptance gate passed for available local checks | 280 backend / 790 admin / 433 customer / 514 vendor / 394 rider tests passed. All Flutter analyses clean. Customer/rider Android-target bundles and vendor host bundle passed. Real devices/services unverified. |
| 2 — India-wide geography | Local acceptance gate passed | Two-city serviceability/lifecycle tests pass; 301 backend gate tests + late-capture regression, 798 admin and 434 customer tests pass. Configurable maps use mocked adapter tests; live providers/devices unverified. |
| 3 — grocery inventory/checkout | Local acceptance gate passed | Core 316 backend tests; additional 91 split/pricing tests and final 16-case grocery suite passed. Admin 804, customer 436, vendor 517, rider 394 passed; all Flutter analyses and three Android debug APK builds passed. |
| 4 — dispatch/production pilot | Local acceptance gate passed; external launch gates remain | Integrated dispatch, privacy, FCM outbox, support/operations, security and deploy/restore tooling. External launch gates remain in Docs/10. |

Implemented in Phase 1: empty-database bootstrap with historical checksum preservation; explicit development-only payment disablement; safe local environment generation; test-only HMAC/JWT fixtures and disposable-database guard; CSV test compatibility without removing byte assertions; patched proxy-addr/busboy lockfile versions; central neutral brand generation and initial admin/mobile identity integration; database Compose configuration and dependency license inventory.

FCM, Razorpay, relational ownership and existing APIs remain in place. See test evidence and limitations; neither compilation nor documentation is an acceptance gate by itself.

Phase 2: owned structured addresses, manual/GPS entry and optional geocoding; address-selected nearby stores; configured cities/zones/coverage and India-time hours; exact paise zone fees; checkout revalidation under locks; immutable delivery snapshots and role-based address disclosure; admin Coverage UI; versioned API aliases with shared rate limits; generic two-step profile onboarding; delayed capture cancellation/refund race repair. Original migration history remains unchanged.


## Phase 4 — delivery, operations and controlled pilot

Implemented: geography-aware private rider offers with fair selection, timeout/decline retry, visible escalation and admin retry/reassignment; approved active-job-only GPS, owner/admin realtime delivery, retention and historical address redaction; pickup-arrival recording and expiring attempt-limited doorstep OTP. All three mobile apps consume updated role-specific push events and support persistent help threads. Vendor gallery upload creates usable catalog image URLs. The admin Operations tab connects real city metrics, dispatch queues, support actions, linked order controls and audit pagination.

Reliability/security: transactional notification intents retain delivery work across provider outages; PushLog supplies deduplication/backoff/dead-token handling. A device token cannot move between accounts; mobile account changes rotate the Firebase token. Disabled-provider batches defer together to avoid database-pool pressure. Acceptance and expiry now lock rider/order/offer in a consistent order, fixing an actual stress-test deadlock. Reviews use observed ratings rather than fabricated prior counts. Settlement aggregates round per record to integer paise. Global free/small-order fee policies now compose with zone rates and split charges once per checkout.

Production preparation: platform secure token storage and migration, Android backup disabled, owned release signing required, removed upstream Firebase clients, HTTPS/origin/secret-strength guards, JSON logs/redaction, nonroot multi-stage API image, private persistent PostgreSQL/upload volumes with Caddy, CI all-backend test gate, backup/empty-target restore scripts and rollback runbook. Neutral branding and public pilot/legal drafts replace unsupported marketing claims. No production infrastructure or live payment was enabled.

Database: three additive Phase 4 migrations create dispatch/support/outbox records, pickup/OTP fields and nullable actual rider reviews; 21 migrations total. Original migrations are unchanged. New UTF-8 databases preserve the older local databases and fix Unicode test encoding. A populated backup restored nine users, two vendors, 80 products and 21 migration records into a new isolated database.

Files: `backend/src/services/{dispatch,orderFlow,orderView,geography,finance}.ts`, push services, `routes/operations.ts`, uploads/products/partners/auth/realtime; all three Flutter role apps and shared secure-session/support code; admin Operations/Coverage; landing; `deploy/`, backup/release scripts, CI and mandatory Docs/01–10.

Verification: full customer 441, vendor 519, driver 396 and admin 807 tests passed. Exact final backend, analysis, APK/container/install checks are recorded in Docs/05 and phase4 evidence. Failed diagnostic runs were used to repair real concurrency/privacy issues and retire obsolete shared-pool/campus test contracts; they are not counted as passing checks.

Limitations / next action: operator-owned Google OAuth, Firebase devices, Razorpay TEST payment/refund, maps, release signing, legal/support ownership and security review remain required for a real pilot. Automated disbursement is explicitly pending integration. The available local gate prepares these integrations; it does not declare external production readiness.

Approved vendor profile management is connected under Help → Store profile (`GET/PUT /api/v1/partner/store`). Owners edit their own name, pickup-address label and HTTPS banner; city/PIN/schedule/area remain operator-managed. Changing the pickup address disables the store's coverage atomically until operations reconfirms coordinates/coverage. Unknown/admin fields and duplicate names are rejected; changes are audited and retries preserve app edits. Product, location and payout controls remain available separately.

A further stress run identified connection-pool starvation: checkout opened a transaction and then read settings on the global Prisma client. Transactional pricing now reads settings through its own transaction, without populating the shared cache. A real one-connection-pool child-process regression and 61 pricing/grocery/config tests passed. Runs interrupted by disk exhaustion or mid-implementation changes are diagnostic only; the final full run uses a fresh UTF-8 disposable database.

Final local Phase 4 gate: **42 backend suites / 1058 tests passed**, admin 807, customer 441, vendor 519 and rider 396 passed. All three analyses, host bundles and Android debug APKs passed; backend/web builds, nonroot read-only container readiness, migration drift and populated restore passed. See evidence/phase4-results.txt. Next action is operator-owned staging/service/device validation, not another implementation phase.
