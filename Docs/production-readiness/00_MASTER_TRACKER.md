# Grozo production-readiness master tracker

Source baseline: `be665d1a71b91bc32c5935ee4108740db9bc1eba`; retained local documentation: `152ed6a`. Working branch: `feature/production-readiness`; intended integration branch: `feature/india-grocery-platform`. Latest remote branch heads were independently read using `git ls-remote`; no newer implementation was discarded. The failed Actions run is reported by the user; direct Actions API inspection currently returns Forbidden.

This tracker distinguishes existing protections from new implementation. A document, fixture test, or past green run does not make a task complete. Production deployment/authentication cutover, live funds, destructive live data operations and paid infrastructure remain gated by explicit owner authorization. All local migrations/tests use isolated databases.

## Phases and ownership

A: 00/01/02/03/04/16/18. B: 05/06/07/08/09/10/11/12. C: 13/14/15/20/22. D: 17/19/21/23. E: 24/25. Named workstreams own isolated file areas; the coordinator owns Prisma schema/migration integration, shared order/payment hooks, cross-stream verification and handover. No stream may silently rework another stream's financial or authorization semantics.

## Task records

### TASK 00 — Baseline/implementation tracker

- Priority: **P0**. Owner/workstream: **Coordinator**.
- Current implementation / root cause: Existing tests and prior run evidence exist; new Actions inspection is blocked externally.
- Files: Repository, .github/workflows, Docs/qa, backend/test, apps/*/test.
- Planned implementation: Record source/CI/test inventory and dependencies before code changes.
- Dependencies: None.
- Acceptance: Latest available source retained, all 26 tasks mapped; blocked CI inspection clearly labelled.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending** (source/CI/test inventory recorded; independent CI inspection remains externally blocked).
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 01 — Pricing concurrency and failed CI

- Priority: **P0**. Owner/workstream: **Pricing**.
- Current implementation / root cause: Concurrent test ignores edit responses; transaction/recalculation behavior needs reproduction, not an assumed root cause.
- Files: backend/src/services/catalog.ts; backend/src/routes/catalog.ts; backend/test/e2e/pricing_catalog.test.ts; .github/workflows/baseline.yml.
- Planned implementation: Trace edit responses, isolation/locks/retries and pricing audit; implement and repeat deterministic concurrent regression.
- Dependencies: 00.
- Acceptance: Successful edits persist; recalculation/commission/customer price invariants hold; full CI status reported honestly.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 02 — Authentication/environment alignment

- Priority: **P0**. Owner/workstream: **Auth/Infrastructure**.
- Current implementation / root cause: Clerk modes and rollback exist; primary Render Blueprint remains legacy/default manual deploy.
- Files: backend/src/config; backend/src/middleware/clerk.ts; apps/*/lib/config; web/super_admin/src/services; render.yaml.
- Planned implementation: Add safe operational auth/version configuration diagnostics and clear client incompatibility handling; preserve explicit cutover approval.
- Dependencies: 00.
- Acceptance: Role/ownership/suspension/session rules intact; mismatched environments fail clearly; no automatic production auth cutover.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 03 — Payment capabilities

- Priority: **P0**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Provider service exists; quote/payment-method advertisement must be tied to actual readiness.
- Files: backend/src/services/paymentService.ts; backend/src/routes/marketplace.ts; apps/customer_app/lib/screens/checkout_screen.dart.
- Planned implementation: Centralize authoritative capabilities and enforce in quote/checkout/payment start.
- Dependencies: 00,02.
- Acceptance: Disabled/missing provider never advertises working online payment; COD is explicitly configured; provider state tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 04 — Pending checkout replacement

- Priority: **P0**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Unpaid superseding/coupon/stock recovery exists; in-flight provider confirmation needs protected replacement window.
- Files: backend/src/services/orderFlow.ts; orderGroups.ts; paymentReconcile.ts; refundService.ts; apps/customer_app/lib/services/order_api.dart.
- Planned implementation: Protect recent/uncertain online payment attempts, reconcile safely and expose resume/cancel/retry choices.
- Dependencies: 03.
- Acceptance: No duplicate charge or cancelled-order fulfillment; exactly-once stock/coupon release and late-capture refund handling.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 05 — Dispatch timing/preparation

- Priority: **P1**. Owner/workstream: **Dispatch**.
- Current implementation / root cause: Dispatch already works for accepted/preparing/ready orders without coordinated preparation/travel timing.
- Files: backend/src/services/dispatch.ts; orderView.ts; apps/vendor_app/lib; apps/driver_app/lib; apps/customer_app/lib.
- Planned implementation: Implement packing/dispatch-ready estimates, arrival-aware matching and stage-specific information with bounded operator override.
- Dependencies: 03,06,07,09.
- Acceptance: Already-ready matches immediately; early assignment only justified by ETA; packing delay/cancellation/offer timeout covered.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 06 — Operational capacity

- Priority: **P0/P1**. Owner/workstream: **Dispatch**.
- Current implementation / root cause: Serviceability and rider eligibility exist but quote/commit capacity need separate authoritative evaluation.
- Files: backend/src/services/geography.ts; marketplace.ts; dispatch.ts; backend/src/routes/marketplace.ts.
- Planned implementation: Add capacity assessment and conservative delivery windows; recheck at checkout and bounded recovery/escalation.
- Dependencies: 03,07,16.
- Acceptance: No online payment without viable fulfillment path; constrained queue supported only with explicit bounded recovery.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 07 — Routing/ETA and SLA

- Priority: **P1**. Owner/workstream: **Dispatch**.
- Current implementation / root cause: Straight-line dispatch and maps helpers exist; road-provider abstraction and honest operational ETA need review.
- Files: backend/src/services/maps.ts; dispatch.ts; geography.ts; settings.ts; app order views.
- Planned implementation: Provide optional licensed provider interface, cached fallback and stage-aware estimates/SLA alert data.
- Dependencies: 00.
- Acceptance: Missing routing keys use labelled estimates; no invented throughput/ten-minute promises or paid resource creation.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 08 — GPS recovery/security

- Priority: **P1**. Owner/workstream: **GPS (after pricing)**.
- Current implementation / root cause: Freshness/proximity checks exist; accuracy/replay/impossible updates and audited exceptions need improvement.
- Files: backend/src/services/marketplace.ts; backend/src/realtime.ts; apps/driver_app/lib/services/location_source.dart; active_delivery.dart.
- Planned implementation: Validate measured accuracy/timestamps, recoverable refresh guidance, permission/resume behavior and authorized audited exception protocol.
- Dependencies: 05,07,18.
- Acceptance: Rider cannot self-bypass proof; stale/replayed/weak GPS and unauthorized overrides rejected with actionable errors.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 09 — Vendor acknowledgment/preparation SLAs

- Priority: **P1**. Owner/workstream: **GPS/SLA (after pricing)**.
- Current implementation / root cause: Acceptance timeout/maintenance exists; bounded configuration, countdown/escalation and busy mode need integration.
- Files: backend/src/services/orderMaintenance.ts; settings.ts; apps/vendor_app/lib/screens/kitchen_queue.dart.
- Planned implementation: Add bounded response/preparation policies, durable escalation, honest customer delays and accept/expiry race tests.
- Dependencies: 05,16.
- Acceptance: No indefinite order extension; COD and captured-payment expiry recovery correctly separate.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 10 — Physical inventory disposition/batches

- Priority: **P1**. Owner/workstream: **Inventory**.
- Current implementation / root cause: Stock reservations/ledger/low-stock/barcodes exist; cancellations assume reusable stock and lack batch/expiry accounting.
- Files: backend/src/services/inventory.ts; backend/src/routes/products.ts; apps/vendor_app/lib/screens/product_inventory_screen.dart; Prisma additions.
- Planned implementation: Add transactional physical disposition, optional batches/expiry, correction reasons, expired blocking and owned-store controls.
- Dependencies: 00,18.
- Acceptance: Unusable packed stock never automatically restored; balances and reservations reconcile exactly once.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 11 — Shortages/substitutions/partial refunds

- Priority: **P1**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Existing full-order refunds/ledger cannot be replaced; customer-approved line adjustments need implementation.
- Files: backend/src/services/refundService.ts; finance.ts; orderView.ts; new adjustment module; customer/vendor order screens.
- Planned implementation: Add versioned item shortage/replacement proposals, customer decisions, recalculated snapshots and idempotent partial provider/COD adjustments.
- Dependencies: 03,04,10,21.
- Acceptance: No silent upward charge, double refund or stale settlement; cheaper/same/more expensive/quantity/coupon cases tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 12 — COD remittance reconciliation

- Priority: **P1**. Owner/workstream: **Operations**.
- Current implementation / root cause: Exact COD collection/administrative handover exists; append-only shortages/disputes/closing need extension.
- Files: backend/src/routes/marketplace.ts; finance.ts; web/super_admin/src/components/CashLedgerPanel.tsx.
- Planned implementation: Extend existing cash records with immutable reconciliations, balances, disputes, reviewed handovers and daily close.
- Dependencies: 00,18,21.
- Acceptance: Rider confirmation never equals platform receipt; duplicate/wrong amount/failed handover tested at paise precision.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 13 — Admin operations command center

- Priority: **P1**. Owner/workstream: **Operations**.
- Current implementation / root cause: Existing operations/support/refunds/finance panels must be integrated rather than replaced.
- Files: backend/src/routes/operations.ts; web/super_admin/src/components/OperationsPanel.tsx; LiveCommandCenter.tsx.
- Planned implementation: Unify actionable exceptions with severity/owner/SLA/actions/audited resolution and safe escalation.
- Dependencies: 05,06,08,09,11,12,14,16.
- Acceptance: RBAC/ownership enforced; concurrent recovery cannot duplicate financial or dispatch actions.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 14 — Support cases/evidence

- Priority: **P1**. Owner/workstream: **Operations**.
- Current implementation / root cause: SupportCase and support APIs exist; extend structured categories, ownership, notes, evidence and escalation.
- Files: backend/src/routes/operations.ts; uploads.ts; apps/customer_app/lib/screens/support_center_screen.dart; admin OperationsPanel.
- Planned implementation: Extend existing support with priority/assignment, private conversations/evidence, reopen/resolution links and retention.
- Dependencies: 18.
- Acceptance: No cross-account/order evidence exposure; safe MIME/size/authorization, audit and customer-visible progress tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 15 — Notification reliability

- Priority: **P0/P1**. Owner/workstream: **Jobs/Notifications**.
- Current implementation / root cause: Durable intents/device ownership/native channels exist; staging owned Firebase configs unavailable.
- Files: backend/src/services/push; apps/*/lib/services/push; scripts/clerk/build_test_apks.py.
- Planned implementation: Audit/recover intents and expired-offer deep links, preserve offline polling and prepare real-device FCM matrix.
- Dependencies: 16,18.
- Acceptance: No actionable expired offers; account token/logout isolation; no fake credentials or claimed real push without device.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 16 — Durable background jobs

- Priority: **P0**. Owner/workstream: **Jobs/Notifications**.
- Current implementation / root cause: Timers and some existing row leases exist; scheduling/restart ownership must cover every maintenance process.
- Files: backend/src/index.ts; backend/src/services/orderMaintenance.ts; paymentReconcile.ts; settlement.ts; new job services.
- Planned implementation: Implement PostgreSQL durable job ownership/lease scheduler, recovery/backoff/dead-letter/monitoring without paid queue.
- Dependencies: 00,18.
- Acceptance: Crashes/restarts/multiple workers cannot duplicate refund/dispatch/payout transitions; leases and recovery tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 17 — Deployment/database/storage/recovery

- Priority: **P0**. Owner/workstream: **Auth/Infrastructure**.
- Current implementation / root cause: Neon direct/pooled and hosted migration wrappers exist; validate contract, readiness, persistent storage and recovery.
- Files: render.yaml; backend/scripts; web/super_admin/vercel.json; scripts; config templates.
- Planned implementation: Improve configuration/version contracts and non-destructive backup/isolated restore/upload recovery tooling.
- Dependencies: 02,16,18.
- Acceptance: No auto-deploy/auth cutover/paid resources; isolated restore verified; live services labelled unverified where unavailable.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 18 — Security/privacy/finance review

- Priority: **P0**. Owner/workstream: **Auth/Infrastructure + coordinator**.
- Current implementation / root cause: Existing Clerk, roles, ownership and finance protections are baseline, not new functionality.
- Files: backend/src/middleware; routes/uploads.ts; services/finance.ts; service logging; package locks.
- Planned implementation: Audit and fix concrete authorization/input/upload/logging/retention/dependency issues without relaxing protections.
- Dependencies: 00.
- Acceptance: Role/resource/session isolation and financial idempotency preserved; exposed historical secrets require rotation.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 19 — Seller compliance/invoices

- Priority: **P1**. Owner/workstream: **Compliance (after pricing)**.
- Current implementation / root cause: FSSAI and basic store fields exist; configurable applicability/document review and truthful receipts need extension.
- Files: backend/src/routes/partners.ts; services/orderView.ts; new compliance/receipts module; admin/vendor/customer views.
- Planned implementation: Add typed optional compliance requirements, protected review/expiry/audit and server-issued receipts using verified existing tax breakdown only.
- Dependencies: 10,11,18.
- Acceptance: No universal invented tax/GST obligation; legal/tax/provider release decisions explicitly operator-reviewed.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 20 — Vendor operational tools

- Priority: **P2**. Owner/workstream: **Inventory**.
- Current implementation / root cause: Schedules, approval and inventory exist; integrate busy/preparation capacity/expiry/performance tools.
- Files: backend/src/services/vendorProfile.ts; backend/src/routes/products.ts; apps/vendor_app/lib/screens; admin inventory.
- Planned implementation: Extend approved-store tools with stock/batch warnings, SKU lookup, resubmission visibility and measured metrics.
- Dependencies: 05,09,10.
- Acceptance: Current theme/multiple-store ownership preserved; no cross-vendor writes or invented performance values.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 21 — Payout readiness/reconciliation

- Priority: **P2**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Settlement/rider payout records and provider interface exist; retain ledger and explicit bank-transfer distinction.
- Files: backend/src/services/settlement.ts; payoutProvider.ts; finance.ts; admin finance components.
- Planned implementation: Add reconciliation/holds/adjustment/refund/COD linkage and disabled-by-default disbursement adapter readiness.
- Dependencies: 03,04,11,12,18.
- Acceptance: No actual transfer activation; no duplicate payout; ledger entry never falsely proves bank settlement.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 22 — Offline/device recovery

- Priority: **P1**. Owner/workstream: **Coordinator + all mobile owners**.
- Current implementation / root cause: Existing offline/session/approval/deep-link flows and regression tests exist.
- Files: apps/*/lib; apps/*/test; Docs/production-readiness/07_ANDROID_TEST_GUIDE.md.
- Planned implementation: Implement missing recoverable/failed-server states and create explicit owner-run Android Pass/Fail matrix.
- Dependencies: 02,03,05,08,15.
- Acceptance: No fake successes, unsafe duplicate taps or stale offers; preserve theme; device execution not fabricated.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 23 — Controlled pilot performance

- Priority: **P1/P2**. Owner/workstream: **Coordinator/QA**.
- Current implementation / root cause: No new throughput claims; existing suite harness may provide safe synthetic workload.
- Files: backend/test/harness; new scripts/qa production load tooling; database query paths.
- Planned implementation: Measure isolated synthetic concurrent workload and implement justified indexed/bounded optimizations.
- Dependencies: 01,05,06,10,16.
- Acceptance: Exact reproducible conditions and before/after evidence; no destructive live load test.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 24 — Final integration regression

- Priority: **P0**. Owner/workstream: **Coordinator/QA**.
- Current implementation / root cause: Prior 1,147 backend and app test runs exist but cannot certify new changes.
- Files: backend/test; apps/*/test; web/super_admin tests; .github/workflows.
- Planned implementation: One fresh complete backend invocation, all app/admin analysis/tests/builds and final-commit CI inspection.
- Dependencies: 01–23.
- Acceptance: No hidden skips/combined rerun counts; actual external/fixture results distinguished; required CI not claimed green without evidence.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

### TASK 25 — Matched APKs and handover

- Priority: **P0**. Owner/workstream: **Coordinator/QA**.
- Current implementation / root cause: Historical versioned GitHub artifacts exist and must remain intact.
- Files: scripts/clerk/build_test_apks.py; verify_apks.py; artifact worktree; Docs/production-readiness.
- Planned implementation: Build all three apps from matched committed revision/version, verify signatures/origins/checksums and publish stable downloads.
- Dependencies: 24.
- Acceptance: Three actual verified APKs; no emulator API; physical-device and provider limitations clearly declared.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Baseline mapped; implementation pending**.
- Commit: not yet implemented.
- Remaining verification: targeted/full regressions and applicable external/provider/device checks; no unsupported production-readiness claim.

## Current integration gates

- Preserve the current Grozo branding and tested marketplace behavior.
- One coordinated Prisma schema owner; additive reviewed migrations only.
- One full-backend regression process at a time; per-stream tests use separate isolated databases.
- Never count historical features as newly completed work.
- Mark external Actions, provider credentials, physical Android testing and legal/tax sign-off independently of source completion.
