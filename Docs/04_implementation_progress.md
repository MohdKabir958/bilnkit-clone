# Implementation progress

| Phase | Status | Evidence / gate |
|---|---|---|
| 1 — audit, run, baseline repairs | Acceptance gate passed for available local checks | 280 backend / 790 admin / 433 customer / 514 vendor / 394 rider tests passed. All Flutter analyses clean. Customer/rider Android-target bundles and vendor host bundle passed. Real devices/services unverified. |
| 2 — India-wide geography | Local acceptance gate passed | Two-city serviceability/lifecycle tests pass; 301 backend gate tests + late-capture regression, 798 admin and 434 customer tests pass. Configurable maps use mocked adapter tests; live providers/devices unverified. |
| 3 — grocery inventory/checkout | Local acceptance gate passed | Core 316 backend tests; additional 91 split/pricing tests and final 16-case grocery suite passed. Admin 804, customer 436, vendor 517, rider 394 passed; all Flutter analyses and three Android debug APK builds passed. |
| 4 — dispatch/production pilot | Not started | Requires Phase 3 acceptance gate. No deployment or paid-service action authorized. |

Implemented in Phase 1: empty-database bootstrap with historical checksum preservation; explicit development-only payment disablement; safe local environment generation; test-only HMAC/JWT fixtures and disposable-database guard; CSV test compatibility without removing byte assertions; patched proxy-addr/busboy lockfile versions; central neutral brand generation and initial admin/mobile identity integration; database Compose configuration and dependency license inventory.

FCM, Razorpay, relational ownership and existing APIs remain in place. See test evidence and limitations; neither compilation nor documentation is an acceptance gate by itself.

Phase 2: owned structured addresses, manual/GPS entry and optional geocoding; address-selected nearby stores; configured cities/zones/coverage and India-time hours; exact paise zone fees; checkout revalidation under locks; immutable delivery snapshots and role-based address disclosure; admin Coverage UI; versioned API aliases with shared rate limits; generic two-step profile onboarding; delayed capture cancellation/refund race repair. Original migration history remains unchanged.
