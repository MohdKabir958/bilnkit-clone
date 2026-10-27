# Grozo production-readiness master tracker

Source baseline: `be665d1a71b91bc32c5935ee4108740db9bc1eba`; retained local documentation: `152ed6a`. Working branch: `feature/production-readiness`; intended integration branch: `feature/india-grocery-platform`. Latest remote branch heads were independently read using `git ls-remote`; no newer implementation was discarded. The earlier Actions access block was resolved during continuation; recovered backend/admin/mobile source workflows are confirmed successful. Latest-source CI is recorded in the release handover.

This tracker distinguishes existing protections from new implementation. A document, fixture test, or past green run does not make a task complete. Production deployment/authentication cutover, live funds, destructive live data operations and paid infrastructure remain gated by explicit owner authorization. All local migrations/tests use isolated databases.

## Continuation audit — recovered work and remaining acceptance

Recovered the complete local workspace, including uncommitted Flutter/Admin changes, screenshot evidence, documentation and 1.15 APK outputs. No reconstruction or restart was necessary. The previously unpushed recovered source `81f80c3` and the additive support-notification backend commit `ca886b4` are now pushed to this branch. `fe8b9be` remains an ancestor. Hosted workflows for `fe8b9be` and `81f80c3` are independently confirmed successful; source release 477d867 also passed its complete hosted workflow; evidence is linked in the handover.

The source audit found three incomplete requirements and one UX gap: the customer discarded pre-checkout ETA; public support replies had no durable outbox/mobile deep link; worker and FSSAI-expiry monitoring APIs had no admin panel; exception follow-up omitted its owner. These are implemented in the continuation. Fresh full backend/admin/Flutter regressions and enabled captures passed. No remaining task is abandoned because an external provider/device check is blocked. The acceptance matrix below and final handover distinguish source completion from external checks.

The hosted Render `/ready` and Vercel admin are reachable; Render reports unconfigured push. `/api/config` returned 404. This release has not been deployed. Publishing source/APKs does not certify hosted API compatibility or perform a production/authentication cutover.

## All 26 tasks — continuation acceptance matrix

“Implemented” describes source behavior, not production approval. External checks below remain part of acceptance. No task is missing its source implementation; tasks 22/24/25 and live-provider/hosted acceptance are explicitly distinguished. The final APK/publication evidence is linked in 10_FINAL_HANDOVER.md.

| Task | Scope | Source status | Verification / implemented behavior | Remaining acceptance |
| --- | --- | --- | --- | --- |
| 00 | Baseline/recovery/tracker | Implemented | Recovered 81f80c3; full inventory and evidence retained/pushed | Environment draft review/publication and clean-machine replay |
| 01 | Pricing concurrency / CI | Implemented | Transaction-client settings fix; ten constrained-pool repetitions; full backend passed | Hosted source CI passed for 477d867; physical/provider checks are separate |
| 02 | Authentication/environment alignment | Implemented | Clerk/legacy contract, RBAC and mismatch regressions | Hosted Clerk sessions, callbacks and operator-approved release alignment |
| 03 | Payment capabilities | Implemented | Fresh server quote/city/provider controls; checkout regression | Owned Razorpay test-mode provider check |
| 04 | Pending/abandoned checkout | Implemented | Durable creation, unknown outcomes, protected attempts and expiry regressions | Real asynchronous provider outcomes |
| 05 | Packing-aware dispatch | Implemented | Preparation estimates, ready matching, travel timing, stage UI | Physical pickup/delivery timing |
| 06 | Capacity at quote/commit | Implemented | Fresh eligible riders, zone locks, load, bounded recovery; full backend | Field capacity and staging soak |
| 07 | Routing / ETA / SLAs | Implemented | Fallback/provider interface, SLA settings, stage estimates and pre-checkout window | Licensed road-provider and field validation |
| 08 | GPS proof / recovery | Implemented | Accuracy/replay/movement checks; independent expiring admin exception; OTP retained | Physical permission/GPS/device checks |
| 09 | Vendor acknowledgment/packing expiry | Implemented | Configurable policy, warning/recovery/escalation and bounded jobs | Operational field timing |
| 10 | Physical inventory / lots | Implemented | FEFO, expiry, missing/damaged/packed return inspection and stock tests | Real stock/inspection acceptance |
| 11 | Alternatives / partial refunds | Implemented | Versioned full-basket approval, reductions/COD/refund confirmation; higher charges refused as explicitly permitted by REQUEST | Real gateway partial-refund confirmation |
| 12 | Cash reconciliation | Implemented | Append-only receipt/dispute/partial balance/daily close and independent supervisor tests | Operator cash process validation using synthetic records |
| 13 | Admin exceptions | Implemented | Unified queue, severity/SLA/reference/actions/audit and approved owner assignment; current browser capture passed | Operator walkthrough |
| 14 | Support workflow | Implemented | Private cases/evidence/retention, owner/priority/escalation/reopen; private-thread deep links | Physical evidence/photo acceptance |
| 15 | Reliable notifications | Implemented | Durable order/support outbox, account ownership, expired offers, device retry acknowledgments | Owned per-app Firebase files/service account and actual delivery; handed APKs disable unconfigured FCM |
| 16 | Durable background jobs | Implemented | PostgreSQL leases/fences/heartbeat/backoff/dead-letter; admin history/reasoned retry | Hosted restart/long-soak operational drill |
| 17 | Deployment / storage / backup | Implemented in source | Schema-aware readiness, TLS/pool/direct config, private/public storage and isolated restore tooling | Approved staging rollout; persistent hosted storage and off-site restore/RPO/RTO drill; no paid infrastructure created |
| 18 | Security/privacy/finance | Implemented | Authentication/ownership/signatures, bounded private uploads, encrypted finance and dependency audit | Rotate previously exposed secrets; deployment/Play/privacy review |
| 19 | Seller documents / receipts | Implemented | GST/FSSAI applicability/review/expiry reminders and informational receipts | Actual seller documents and responsible tax/legal confirmation |
| 20 | Vendor grocery tools | Implemented | Stock/expiry/SKU/batch tools, IST schedules, busy/preparation policy and owned reports | Physical vendor usability and configured push |
| 21 | Payout readiness | Implemented | Eligibility/holds/references/reconciliation and sandbox dry run | Real disbursement intentionally disabled; explicit approval and provider required |
| 22 | Offline / real devices | Source implemented; device acceptance blocked | Automated recovery/session/offline/expiry states; manual acceptance sheet | No attached Android device; physical installation, account switch, GPS, OTP and background/resume checks |
| 23 | Performance pilot | Implemented locally | 1368 synthetic HTTP requests, zero 5xx; measured latency; pricing before/after | Long hosted soak, representative volume and any multi-instance adapter validation |
| 24 | Complete regression | Implemented and locally verified | Backend 1238/0/0; Admin 859/0/0 and build; Flutter 480/538/418, no failures; analysis and enabled captures pass | Hosted source CI passed for 477d867; external provider/device checks remain |
| 25 | Three APKs / handover | Implemented and published | Three 1.16.0+24 builds/signatures/ABI/package/secret-pattern checks passed; actual HTTP 200 downloads matched SHA-256 | Owner physical installation/update and device acceptance |

## Phases and ownership

A: 00/01/02/03/04/16/18. B: 05/06/07/08/09/10/11/12. C: 13/14/15/20/22. D: 17/19/21/23. E: 24/25. Work is now performed sequentially by the coordinator, as requested by the owner. No agents or overlapping heavy checks are used. The earlier workstreams are retained only as historical ownership labels.

## Task records

### TASK 00 — Baseline/implementation tracker

- Priority: **P0**. Owner/workstream: **Coordinator**.
- Current implementation / root cause: Existing tests and prior run evidence exist; new Actions inspection is blocked externally.
- Files: Repository, .github/workflows, Docs/qa, backend/test, apps/*/test.
- Planned implementation: Record source/CI/test inventory and dependencies before code changes.
- Dependencies: None.
- Acceptance: Latest available source retained, all 26 tasks mapped; recovered source CI and current external limitations clearly labelled.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Implemented; current evidence in release handover**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Publish/review environment draft and clean-machine replay.

- Implementation update (26 October 2026): REQUEST.md retained verbatim, baseline/remote heads checked, environment repaired and setup replayed. Actions API inspection remains Forbidden.

### TASK 01 — Pricing concurrency and failed CI

- Priority: **P0**. Owner/workstream: **Pricing**.
- Current implementation / root cause: Concurrent test ignores edit responses; transaction/recalculation behavior needs reproduction, not an assumed root cause.
- Files: backend/src/services/catalog.ts; backend/src/routes/catalog.ts; backend/test/e2e/pricing_catalog.test.ts; .github/workflows/baseline.yml.
- Planned implementation: Trace edit responses, isolation/locks/retries and pricing audit; implement and repeat deterministic concurrent regression.
- Dependencies: 00.
- Acceptance: Successful edits persist; recalculation/commission/customer price invariants hold; full CI status reported honestly.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Implemented; current evidence in release handover**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Hosted source CI passed for 477d867; see final handover.

- Implementation update (26 October 2026): getSettings(tx) uses the existing interactive transaction instead of starving a second pool connection. Edit HTTP success, persistence, audit atomicity and price invariants asserted. Ten repeated two-connection runs and the complete backend checkpoint passed; hosted Actions status unverified.

### TASK 02 — Authentication/environment alignment

- Priority: **P0**. Owner/workstream: **Auth/Infrastructure**.
- Current implementation / root cause: Clerk modes and rollback exist; primary Render Blueprint remains legacy/default manual deploy.
- Files: backend/src/config; backend/src/middleware/clerk.ts; apps/*/lib/config; web/super_admin/src/services; render.yaml.
- Planned implementation: Add safe operational auth/version configuration diagnostics and clear client incompatibility handling; preserve explicit cutover approval.
- Dependencies: 00.
- Acceptance: Role/ownership/suspension/session rules intact; mismatched environments fail clearly; no automatic production auth cutover.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Genuine hosted Clerk sessions/callbacks and approved deployment alignment.

- Implementation update (26 October 2026): Safe deployment contract and API/client compatibility headers reject mismatches without erasing sessions. Clerk/legacy cutover is explicit; keys remain server-side; existing RBAC and ownership checks retained.

### TASK 03 — Payment capabilities

- Priority: **P0**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Provider service exists; quote/payment-method advertisement must be tied to actual readiness.
- Files: backend/src/services/paymentService.ts; backend/src/routes/marketplace.ts; apps/customer_app/lib/screens/checkout_screen.dart.
- Planned implementation: Centralize authoritative capabilities and enforce in quote/checkout/payment start.
- Dependencies: 00,02.
- Acceptance: Disabled/missing provider never advertises working online payment; COD is explicitly configured; provider state tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Owned Razorpay test-mode provider check.

- Implementation update (26 October 2026): Payment capabilities enforce real configured provider/city policy; empty/missing payment-method lists never invent online availability. Customer selection follows the quote. Razorpay-hosted execution requires configured credentials.

### TASK 04 — Pending checkout replacement

- Priority: **P0**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Unpaid superseding/coupon/stock recovery exists; in-flight provider confirmation needs protected replacement window.
- Files: backend/src/services/orderFlow.ts; orderGroups.ts; paymentReconcile.ts; refundService.ts; apps/customer_app/lib/services/order_api.dart.
- Planned implementation: Protect recent/uncertain online payment attempts, reconcile safely and expose resume/cancel/retry choices.
- Dependencies: 03.
- Acceptance: No duplicate charge or cancelled-order fulfillment; exactly-once stock/coupon release and late-capture refund handling.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Actual asynchronous provider outcomes.

- Implementation update (26 October 2026): Durable payment-creation claim and unknown-state recovery avoid duplicate provider orders without holding DB transactions across network I/O. Active checkout attempts/grace periods are protected; replacement/expiry needs authoritative no-capture evidence.

### TASK 05 — Dispatch timing/preparation

- Priority: **P1**. Owner/workstream: **Dispatch**.
- Current implementation / root cause: Dispatch already works for accepted/preparing/ready orders without coordinated preparation/travel timing.
- Files: backend/src/services/dispatch.ts; orderView.ts; apps/vendor_app/lib; apps/driver_app/lib; apps/customer_app/lib.
- Planned implementation: Implement packing/dispatch-ready estimates, arrival-aware matching and stage-specific information with bounded operator override.
- Dependencies: 03,06,07,09.
- Acceptance: Already-ready matches immediately; early assignment only justified by ETA; packing delay/cancellation/offer timeout covered.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Physical pickup and delivery timing.

- Implementation update (26 October 2026): Preparation estimates, travel-aware matching, immediately ready dispatch and bounded audited early matching are integrated. Vendor and rider screens show preparation information in the existing theme.

### TASK 06 — Operational capacity

- Priority: **P0/P1**. Owner/workstream: **Dispatch**.
- Current implementation / root cause: Serviceability and rider eligibility exist but quote/commit capacity need separate authoritative evaluation.
- Files: backend/src/services/geography.ts; marketplace.ts; dispatch.ts; backend/src/routes/marketplace.ts.
- Planned implementation: Add capacity assessment and conservative delivery windows; recheck at checkout and bounded recovery/escalation.
- Dependencies: 03,07,16.
- Acceptance: No online payment without viable fulfillment path; constrained queue supported only with explicit bounded recovery.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Staging/field capacity validation.

- Implementation update (26 October 2026): Capacity checks use approved fresh rider availability, store load and coverage under zone locks at quote/checkout/payment. Recovery deadlines escalate for manual assignment/cancellation; no unsupported automatic fulfillment guarantee.

### TASK 07 — Routing/ETA and SLA

- Priority: **P1**. Owner/workstream: **Dispatch**.
- Current implementation / root cause: Straight-line dispatch and maps helpers exist; road-provider abstraction and honest operational ETA need review.
- Files: backend/src/services/maps.ts; dispatch.ts; geography.ts; settings.ts; app order views.
- Planned implementation: Provide optional licensed provider interface, cached fallback and stage-aware estimates/SLA alert data.
- Dependencies: 00.
- Acceptance: Missing routing keys use labelled estimates; no invented throughput/ten-minute promises or paid resource creation.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Licensed road-routing credentials and field validation.

- Implementation update (26 October 2026): Optional route-provider/cache and labelled conservative fallback feed stage estimates and SLA surfaces. No purchased routing infrastructure or unsupported delivery promise.

### TASK 08 — GPS recovery/security

- Priority: **P1**. Owner/workstream: **GPS (after pricing)**.
- Current implementation / root cause: Freshness/proximity checks exist; accuracy/replay/impossible updates and audited exceptions need improvement.
- Files: backend/src/services/marketplace.ts; backend/src/realtime.ts; apps/driver_app/lib/services/location_source.dart; active_delivery.dart.
- Planned implementation: Validate measured accuracy/timestamps, recoverable refresh guidance, permission/resume behavior and authorized audited exception protocol.
- Dependencies: 05,07,18.
- Acceptance: Rider cannot self-bypass proof; stale/replayed/weak GPS and unauthorized overrides rejected with actionable errors.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Physical Android GPS/permission checks.

- Implementation update (26 October 2026): Accuracy/time/replay/impossible-move validation, location refresh and independent two-admin GPS exceptions preserve assignment and OTP controls. Targeted pickup/dropoff authorization regression passed 12 tests.

### TASK 09 — Vendor acknowledgment/preparation SLAs

- Priority: **P1**. Owner/workstream: **GPS/SLA (after pricing)**.
- Current implementation / root cause: Acceptance timeout/maintenance exists; bounded configuration, countdown/escalation and busy mode need integration.
- Files: backend/src/services/orderMaintenance.ts; settings.ts; apps/vendor_app/lib/screens/kitchen_queue.dart.
- Planned implementation: Add bounded response/preparation policies, durable escalation, honest customer delays and accept/expiry race tests.
- Dependencies: 05,16.
- Acceptance: No indefinite order extension; COD and captured-payment expiry recovery correctly separate.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Staffed operational trial.

- Implementation update (26 October 2026): Bounded acceptance/preparation/busy policies and durable operational SLA escalation preserve COD versus paid cancellation semantics.

### TASK 10 — Physical inventory disposition/batches

- Priority: **P1**. Owner/workstream: **Inventory**.
- Current implementation / root cause: Stock reservations/ledger/low-stock/barcodes exist; cancellations assume reusable stock and lack batch/expiry accounting.
- Files: backend/src/services/inventory.ts; backend/src/routes/products.ts; apps/vendor_app/lib/screens/product_inventory_screen.dart; Prisma additions.
- Planned implementation: Add transactional physical disposition, optional batches/expiry, correction reasons, expired blocking and owned-store controls.
- Dependencies: 00,18.
- Acceptance: Unusable packed stock never automatically restored; balances and reservations reconcile exactly once.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Physical stock/inspection acceptance.

- Implementation update (26 October 2026): FEFO batches/expiry, physical packing and return inspection distinguish usable/unusable shelf stock. Shortage removal records MISSING atomically and never silently returns absent packs to sale.

### TASK 11 — Shortages/substitutions/partial refunds

- Priority: **P1**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Existing full-order refunds/ledger cannot be replaced; customer-approved line adjustments need implementation.
- Files: backend/src/services/refundService.ts; finance.ts; orderView.ts; new adjustment module; customer/vendor order screens.
- Planned implementation: Add versioned item shortage/replacement proposals, customer decisions, recalculated snapshots and idempotent partial provider/COD adjustments.
- Dependencies: 03,04,10,21.
- Acceptance: No silent upward charge, double refund or stale settlement; cheaper/same/more expensive/quantity/coupon cases tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Real provider partial-refund confirmation and phone workflow.

- Implementation update (26 October 2026): Versioned full-basket customer approval supports same/cheaper alternatives and quantity reductions; original capture/snapshots remain immutable. Receipt-bound partial refunds and COD net due are idempotent. Higher charges remain explicitly unsupported rather than silently collected. Fourteen targeted checkout/stock tests passed.

### TASK 12 — COD remittance reconciliation

- Priority: **P1**. Owner/workstream: **Operations**.
- Current implementation / root cause: Exact COD collection/administrative handover exists; append-only shortages/disputes/closing need extension.
- Files: backend/src/routes/marketplace.ts; finance.ts; web/super_admin/src/components/CashLedgerPanel.tsx.
- Planned implementation: Extend existing cash records with immutable reconciliations, balances, disputes, reviewed handovers and daily close.
- Dependencies: 00,18,21.
- Acceptance: Rider confirmation never equals platform receipt; duplicate/wrong amount/failed handover tested at paise precision.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Independent operator cash-control trial.

- Implementation update (26 October 2026): Append-only COD ledger, independent remittance receipts, outstanding balances, disputes and two-person daily close extend existing collection records. No ledger entry is represented as a bank transfer.

### TASK 13 — Admin operations command center

- Priority: **P1**. Owner/workstream: **Operations**.
- Current implementation / root cause: Existing operations/support/refunds/finance panels must be integrated rather than replaced.
- Files: backend/src/routes/operations.ts; web/super_admin/src/components/OperationsPanel.tsx; LiveCommandCenter.tsx.
- Planned implementation: Unify actionable exceptions with severity/owner/SLA/actions/audited resolution and safe escalation.
- Dependencies: 05,06,08,09,11,12,14,16.
- Acceptance: RBAC/ownership enforced; concurrent recovery cannot duplicate financial or dispatch actions.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Staffed exception recovery walkthrough.

- Implementation update (26 October 2026): Operational exceptions have ownership, reasons/evidence, SLA and audited recovery actions; new panels integrate with existing console navigation.

### TASK 14 — Support cases/evidence

- Priority: **P1**. Owner/workstream: **Operations**.
- Current implementation / root cause: SupportCase and support APIs exist; extend structured categories, ownership, notes, evidence and escalation.
- Files: backend/src/routes/operations.ts; uploads.ts; apps/customer_app/lib/screens/support_center_screen.dart; admin OperationsPanel.
- Planned implementation: Extend existing support with priority/assignment, private conversations/evidence, reopen/resolution links and retention.
- Dependencies: 18.
- Acceptance: No cross-account/order evidence exposure; safe MIME/size/authorization, audit and customer-visible progress tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Owned persistent private storage and device evidence capture.

- Implementation update (26 October 2026): Categorized support, private messages, assignment, escalation, reopen and authenticated private photo evidence use bounded size/retention/quota. Readiness now checks both public and private storage.

### TASK 15 — Notification reliability

- Priority: **P0/P1**. Owner/workstream: **Jobs/Notifications**.
- Current implementation / root cause: Durable intents/device ownership/native channels exist; staging owned Firebase configs unavailable.
- Files: backend/src/services/push; apps/*/lib/services/push; scripts/clerk/build_test_apks.py.
- Planned implementation: Audit/recover intents and expired-offer deep links, preserve offline polling and prepare real-device FCM matrix.
- Dependencies: 16,18.
- Acceptance: No actionable expired offers; account token/logout isolation; no fake credentials or claimed real push without device.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Owned per-app Firebase configuration and actual phone delivery; staging APKs disable unconfigured Firebase.

- Implementation update (26 October 2026): Transactional notification intent/outbox, fenced retries, expired-offer suppression and fallback polling are implemented. Real FCM delivery is not asserted without owned Firebase configuration.

### TASK 16 — Durable background jobs

- Priority: **P0**. Owner/workstream: **Jobs/Notifications**.
- Current implementation / root cause: Timers and some existing row leases exist; scheduling/restart ownership must cover every maintenance process.
- Files: backend/src/index.ts; backend/src/services/orderMaintenance.ts; paymentReconcile.ts; settlement.ts; new job services.
- Planned implementation: Implement PostgreSQL durable job ownership/lease scheduler, recovery/backoff/dead-letter/monitoring without paid queue.
- Dependencies: 00,18.
- Acceptance: Crashes/restarts/multiple workers cannot duplicate refund/dispatch/payout transitions; leases and recovery tested.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Hosted restart/long-soak drill.

- Implementation update (26 October 2026): Durable PostgreSQL job claims, lease fencing, heartbeat, bounded concurrency, independent jobs and operator retry replace overlapping schedulers. Provider calls are outside DB transactions. Full 1225-test checkpoint passed.

### TASK 17 — Deployment/database/storage/recovery

- Priority: **P0**. Owner/workstream: **Auth/Infrastructure**.
- Current implementation / root cause: Neon direct/pooled and hosted migration wrappers exist; validate contract, readiness, persistent storage and recovery.
- Files: render.yaml; backend/scripts; web/super_admin/vercel.json; scripts; config templates.
- Planned implementation: Improve configuration/version contracts and non-destructive backup/isolated restore/upload recovery tooling.
- Dependencies: 02,16,18.
- Acceptance: No auto-deploy/auth cutover/paid resources; isolated restore verified; live services labelled unverified where unavailable.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Approved staging rollout, persistent storage/off-site backup and hosted RPO/RTO drill; no paid creation authorized.

- Implementation update (26 October 2026): Render manual deployment baseline/persistent upload and private evidence paths, Neon runtime/direct migration URLs, bounded database and upload recovery tools added. Local isolated restore preserved identity/financial/stock records; the repeated final drill also preserved all 26 migrations. No paid resources created.

### TASK 18 — Security/privacy/finance review

- Priority: **P0**. Owner/workstream: **Auth/Infrastructure + coordinator**.
- Current implementation / root cause: Existing Clerk, roles, ownership and finance protections are baseline, not new functionality.
- Files: backend/src/middleware; routes/uploads.ts; services/finance.ts; service logging; package locks.
- Planned implementation: Audit and fix concrete authorization/input/upload/logging/retention/dependency issues without relaxing protections.
- Dependencies: 00.
- Acceptance: Role/resource/session isolation and financial idempotency preserved; exposed historical secrets require rotation.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Operator credential rotation, external provider/device and publishing review.

- Implementation update (26 October 2026): Server ownership/approval/role enforcement, immutable financial evidence, safe log redaction and schema/storage readiness hardened. Compatible body-parser/follow-redirects patches leave production dependency audit at zero vulnerabilities.

### TASK 19 — Seller compliance/invoices

- Priority: **P1**. Owner/workstream: **Compliance (after pricing)**.
- Current implementation / root cause: FSSAI and basic store fields exist; configurable applicability/document review and truthful receipts need extension.
- Files: backend/src/routes/partners.ts; services/orderView.ts; new compliance/receipts module; admin/vendor/customer views.
- Planned implementation: Add typed optional compliance requirements, protected review/expiry/audit and server-issued receipts using verified existing tax breakdown only.
- Dependencies: 10,11,18.
- Acceptance: No universal invented tax/GST obligation; legal/tax/provider release decisions explicitly operator-reviewed.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Actual seller/tax/document/legal approval.

- Implementation update (26 October 2026): Controlled seller/GST/FSSAI applicability and private compliance references, plus informational order receipts and account/privacy integration. No invented GST invoice or automatic tax/legal approval.

### TASK 20 — Vendor operational tools

- Priority: **P2**. Owner/workstream: **Inventory**.
- Current implementation / root cause: Schedules, approval and inventory exist; integrate busy/preparation capacity/expiry/performance tools.
- Files: backend/src/services/vendorProfile.ts; backend/src/routes/products.ts; apps/vendor_app/lib/screens; admin inventory.
- Planned implementation: Extend approved-store tools with stock/batch warnings, SKU lookup, resubmission visibility and measured metrics.
- Dependencies: 05,09,10.
- Acceptance: Current theme/multiple-store ownership preserved; no cross-vendor writes or invented performance values.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Vendor device acceptance and configured push.

- Implementation update (26 October 2026): Busy/preparation policy, stock-out/expiry/batch warnings, barcode/SKU search, approval visibility and stock tools are present. Vendor-editable IST schedules and owned-store preparation/cancellation/shortage reports now have backend coverage in the complete 1,233-test run. Low-stock alerts are in-app; remote Firebase delivery still requires owned provider configuration.

### TASK 21 — Payout readiness/reconciliation

- Priority: **P2**. Owner/workstream: **Coordinator/Payments**.
- Current implementation / root cause: Settlement/rider payout records and provider interface exist; retain ledger and explicit bank-transfer distinction.
- Files: backend/src/services/settlement.ts; payoutProvider.ts; finance.ts; admin finance components.
- Planned implementation: Add reconciliation/holds/adjustment/refund/COD linkage and disabled-by-default disbursement adapter readiness.
- Dependencies: 03,04,11,12,18.
- Acceptance: No actual transfer activation; no duplicate payout; ledger entry never falsely proves bank settlement.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Real transfer intentionally disabled; explicit approval and owned provider required.

- Implementation update (26 October 2026): Existing ledger remains authoritative. Eligibility/holds include refunds, adjustments, support, COD and reconciliation; payout reference uniqueness and sandbox dry run added. No real transfer or live adapter activated.

### TASK 22 — Offline/device recovery

- Priority: **P1**. Owner/workstream: **Coordinator + all mobile owners**.
- Current implementation / root cause: Existing offline/session/approval/deep-link flows and regression tests exist.
- Files: apps/*/lib; apps/*/test; Docs/production-readiness/07_ANDROID_TEST_GUIDE.md.
- Planned implementation: Implement missing recoverable/failed-server states and create explicit owner-run Android Pass/Fail matrix.
- Dependencies: 02,03,05,08,15.
- Acceptance: No fake successes, unsafe duplicate taps or stale offers; preserve theme; device execution not fabricated.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; physical-device verification blocked by hardware availability**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: No attached device; complete the physical acceptance sheet.

- Implementation update (26 October 2026): Approval/session/offline/retry/expired offers/location recovery preserve the theme and never fake successful writes. Manual device pass/fail sheet is required; no phone is attached here.

### TASK 23 — Controlled pilot performance

- Priority: **P1/P2**. Owner/workstream: **Coordinator/QA**.
- Current implementation / root cause: No new throughput claims; existing suite harness may provide safe synthetic workload.
- Files: backend/test/harness; new scripts/qa production load tooling; database query paths.
- Planned implementation: Measure isolated synthetic concurrent workload and implement justified indexed/bounded optimizations.
- Dependencies: 01,05,06,10,16.
- Acceptance: Exact reproducible conditions and before/after evidence; no destructive live load test.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Source implemented; local regression passed; external acceptance remains**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Long hosted soak/production-volume plans; shared Socket.io adapter before multi-instance scaling.

- Implementation update (26 October 2026): Existing concurrent lifecycle invariants now record actual HTTP latency/payload/CPU/memory. The measured pilot added browsing, optimistic stock edits, admin queries, notification outbox/retries and settlement jobs alongside checkout/payment/rider workflows: 1,368 HTTP requests, zero 5xx, median/p95 76.2/363.7 ms. See PERFORMANCE.md. Not a production throughput or leak certification.

### TASK 24 — Final integration regression

- Priority: **P0**. Owner/workstream: **Coordinator/QA**.
- Current implementation / root cause: Prior 1,147 backend and app test runs exist but cannot certify new changes.
- Files: backend/test; apps/*/test; web/super_admin tests; .github/workflows.
- Planned implementation: One fresh complete backend invocation, all app/admin analysis/tests/builds and final-commit CI inspection.
- Dependencies: 01–23.
- Acceptance: No hidden skips/combined rerun counts; actual external/fixture results distinguished; required CI not claimed green without evidence.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Implemented; current evidence in release handover**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Hosted source CI passed for 477d867. Genuine provider/device checks remain.

- Implementation update (26 October 2026): One complete backend checkpoint: 1225 passed, zero failed/skipped, exit 0. The new fixes subsequently passed a fresh complete run: 1,233 tests, 56 suites, zero failures/skips, exit 0. Admin: 855 passed, zero failed/skipped, build passed. Customer fixtures corrected without weakening payment checks; Flutter full suites now pass: customer 476, vendor 537, delivery 417; all analysis clean. Capture-only skips were separately enabled and passed; APK verification is in progress.

### TASK 25 — Matched APKs and handover

- Priority: **P0**. Owner/workstream: **Coordinator/QA**.
- Current implementation / root cause: Historical versioned GitHub artifacts exist and must remain intact.
- Files: scripts/clerk/build_test_apks.py; verify_apks.py; artifact worktree; Docs/production-readiness.
- Planned implementation: Build all three apps from matched committed revision/version, verify signatures/origins/checksums and publish stable downloads.
- Dependencies: 24.
- Acceptance: Three actual verified APKs; no emulator API; physical-device and provider limitations clearly declared.
- Automated coverage: targeted unit/integration and client tests for this workflow; final checks in TASK 24. Specific commands/results will be recorded as implemented.
- Actual status: **Matched 1.16 APKs built, verified, published and download-hash checked**.
- Commit: retained `fe8b9be` / `8e3ac1e` / `81f80c3`; continuation `ca886b4` / `ae413b5` / `cc8ee53`; complete source release `477d867`.
- Remaining verification: Published APKs passed actual download-hash verification; physical installation/update checks remain.

## Current integration gates

- Preserve the current Grozo branding and tested marketplace behavior.
- One coordinated Prisma schema owner; additive reviewed migrations only.
- One full-backend regression process at a time; per-stream tests use separate isolated databases.
- Never count historical features as newly completed work.
- Mark external Actions, provider credentials, physical Android testing and legal/tax sign-off independently of source completion.

- Implementation update (26 October 2026): Build helper embeds staging contract, explicit HTTPS REST/socket endpoints and public Clerk instance. Three matched 1.16.0+24 APKs from 477d867 passed native builds, signature/package/ABI/callback/compiled-origin/secret-pattern checks and actual HTTP 200 download/SHA-256 comparison. Stable versioned GitHub links and final handover are published; historical artifacts remain.

## Final source and verification evidence

Source release: **`477d86743fb1accffffcc7ee99c5d4f1a7802821`**, retaining `fe8b9be`. Reviewable continuation commits separate backend support delivery, admin operations, mobile 1.16, and recovery/capture tooling. Full local results: backend **1238**, admin **859**, customer **480**, vendor **538**, delivery **418**, all zero failures. Capture-only Flutter skips (4/1/1) were separately enabled and passed with zero skips. Three Flutter analyses and the admin build passed. Fresh backup/restore preserved all **27** migration checksums and business/support outbox data.

The all-26-task matrix above is the current acceptance record. Exact commands, logs and distinctions between mocks, real local services and physical/hosted checks are in [06_FULL_TEST_RESULTS.md](06_FULL_TEST_RESULTS.md). APK source/version/signature/checksums/download verification and CI links are in [10_FINAL_HANDOVER.md](10_FINAL_HANDOVER.md). Remaining external requirements are in [09_REMAINING_EXTERNAL_BLOCKERS.md](09_REMAINING_EXTERNAL_BLOCKERS.md). Production deployment, authentication cutover, live financial actions and paid resources remain explicitly gated.


## Subsequent admin workflow follow-up

The eight-task follow-up is tracked separately in [Docs/admin-workflow-fixes/00_TRACKER.md](../admin-workflow-fixes/00_TRACKER.md). Earlier test/APK evidence remains historical to its recorded source. New source must pass its own release gates; current local sandbox/provider limitations do not certify a new production release. No personal account is used.

Latest follow-up handover (27 October 2026): [admin workflow release evidence](../admin-workflow-fixes/10_HANDOVER.md) supersedes the initial environment blockers for that follow-up. Dedicated CI source cba6e5c passed the complete 1266-test backend invocation and ten pricing repetitions; Admin 886/886, all three Flutter CI jobs, three 1.16.1+25 APK builds/public download hashes and 13 genuine local fixture captures/15-page PDF are verified. Historical 26-task evidence above retains its original source/version. Real hosted/provider/physical-device acceptance remains external and no production deployment/authentication switch was performed.
