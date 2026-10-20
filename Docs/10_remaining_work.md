# Remaining work and acceptance gates

This is not yet the completed grocery marketplace requested in the implementation brief.

Phase 1's available-check gate passed: backend 280, admin 790, customer 433, vendor 514, rider 394 tests; all Flutter analyses clean; API/admin start; fresh and repeat DB setup and bundle checks passed as detailed in test evidence. Real device behavior, owned FCM delivery, Google OAuth and Razorpay sandbox transactions remain explicitly unverified. The final full upstream backend suite was not run to completion; the selected core lifecycle/security suite passed.

Phase 2 local gate passed: persisted two-city discovery/coverage, serviceability-enforced checkout and doorstep delivery test, owned multi-address UI with manual/GPS entry, admin geography/hours/fees and configurable maps adapters. Backend 301 + focused late-capture regression, admin 798, customer 434 tests passed. External maps and physical GPS still require validation. Historical campus names remain only for old-data compatibility; new checkout requires enabled geography and an owned saved address.

Phase 3: grocery metadata/units/SKU/variants/MRP/tax, managed categories, paginated/searchable catalog, stock movements/reservations and race safety, cancellation releases; connect vendor/customer/admin UI; verify totals, ownership and 50/30-product acceptance scenarios. Do not label existing food menu CRUD as an inventory system.

Phase 4: geography-aware rider offers/timeout/retry and manual intervention; authorized active-delivery-only GPS and retention; notification reliability; refund/commission/payout reconciliation; support cases/audit dashboards; real database analytics; production security, owned services and release signing; CI/backup restore/monitoring; controlled single-city pilot. Automatic disbursement remains unimplemented.

No source fork rewrite, FCM removal, production deployment or live payment enablement is part of this baseline change. Continue sequentially when the prior phase's verified acceptance gate passes; do not silently skip a failing gate.
