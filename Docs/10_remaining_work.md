# Remaining work and acceptance gates

This is not yet the completed grocery marketplace requested in the implementation brief.

Phase 1's available-check gate passed: backend 280, admin 790, customer 433, vendor 514, rider 394 tests; all Flutter analyses clean; API/admin start; fresh and repeat DB setup and bundle checks passed as detailed in test evidence. Real device behavior, owned FCM delivery, Google OAuth and Razorpay sandbox transactions remain explicitly unverified. The final full upstream backend suite was not run to completion; the selected core lifecycle/security suite passed.

Phase 2 local gate passed: persisted two-city discovery/coverage, serviceability-enforced checkout and doorstep delivery test, owned multi-address UI with manual/GPS entry, admin geography/hours/fees and configurable maps adapters. Backend 301 + focused late-capture regression, admin 798, customer 434 tests passed. External maps and physical GPS still require validation. Historical campus names remain only for old-data compatibility; new checkout requires enabled geography and an owned saved address.

Phase 3: grocery metadata, SKU/pack variants, paise pricing/MRP, paged/searchable store products, reservations/movements, cancellation/expiry releases and connected inventory/detail screens are implemented. Phase 3 local gate passed: final 16-case grocery suite, core 316 backend and additional 91 split/pricing tests, admin 804 and all mobile suites/analyses. All three Android debug APKs built. External integrations/devices and release distribution remain unverified.

Phase 4: geography-aware rider offers/timeout/retry and manual intervention; authorized active-delivery-only GPS and retention; notification reliability; refund/commission/payout reconciliation; support cases/audit dashboards; real database analytics; production security, owned services and release signing; CI/backup restore/monitoring; controlled single-city pilot. Automatic disbursement remains unimplemented.

No source fork rewrite, FCM removal, production deployment or live payment enablement is part of this baseline change. Continue sequentially when the prior phase's verified acceptance gate passes; do not silently skip a failing gate.
