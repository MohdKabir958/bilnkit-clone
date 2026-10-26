# Latest-source verification — 26 October 2026

All heavy checks ran sequentially, against local/synthetic state. The recovered backend checkpoint remains an ancestor; it was not replaced. The source release is `477d86743fb1accffffcc7ee99c5d4f1a7802821` (backend `ca886b4`, admin `ae413b5`, matched mobile `cc8ee53`). Documentation/artifact publication may have later commits without changing these application trees.

| Component | Passed | Failed | Skipped | Duration | Evidence |
| --- | ---: | ---: | ---: | --- | --- |
| Backend, one complete invocation, 57 suites | 1238 | 0 | 0 | 524240 ms | evidence/release-final/ |
| Admin, 58 files | 859 | 0 | 0 | Per-test timing in JSON | evidence/release-admin/ |
| Customer Flutter | 480 | 0 | 4 capture-only | 84188 ms | evidence/release-flutter/customer-tests.jsonl |
| Vendor Flutter | 538 | 0 | 1 capture-only | 94823 ms | evidence/release-flutter/vendor-tests.jsonl |
| Delivery Flutter | 418 | 0 | 1 capture-only | 67658 ms | evidence/release-flutter/driver-tests.jsonl |

Every complete invocation above exited 0. No failed test was disabled or skipped. Flutter skipped cases are exclusively opt-in screenshot tests: the four customer capture files were then enabled and passed 13 tests, vendor capture passed one, delivery capture passed one, with **zero skipped or failed** in the enabled capture runs. Those counts are separate from default suite counts, never added together. All three apps passed `flutter analyze --no-pub` with no issues and frozen `flutter pub get --enforce-lockfile`.

Backend: Node 24.19.0; PostgreSQL 17.11; Linux x64; a new local UTF8 database `grozo_final_1793022095441_test`; all **27** migrations applied. The entire suite used a single Jest invocation. See [exact setup, command, environment, results and full log](../qa/final-backend-regression.md). TypeScript build passed. Jest retains its existing `forceExit: true` configuration and generic open-handle advisory; this is not a claim of a complete test-process handle audit.

Admin: `npm test -- --maxWorkers=1 --minWorkers=1 --reporter=json --outputFile=../../Docs/production-readiness/evidence/release-admin/vitest.json`, then `npm run build`. TypeScript and Vite passed. The principal minified chunk remains 1195.45 kB (334.60 kB gzip); the warning is retained, not suppressed. New tests cover lazy operational diagnostics, reasoned safe retry, running-job protection, expiry reminders and approved exception-owner assignment.

Flutter: `flutter test --no-pub --concurrency=2 --reporter json` for each app separately, on Flutter 3.44.9/Dart 3.12.2. New regressions verify bounded delivery windows, no window when capacity is unavailable, unchanged quoted totals, strict support payloads and authorized private-thread navigation. One earlier new test fixture omitted the real support response's required description field; it was corrected without weakening privacy/denial assertions, and the complete suite reran. A further complete customer run followed the unavailable-capacity guard. Only the final standalone run is reported above. Formatting-related brace warnings were corrected in source; analysis rules were preserved.

Cross-app checks: backend lifecycle journey/stress/group suites exercise real local PostgreSQL, HTTP and Socket.io with customer/vendor/rider/admin roles: checkout, vendor preparation, eligibility/offer races, pickup, delivery proof, cancellation/refunds and financial state. Operations tests enforce private-case ownership. New support-notification integration tests exercise all three app roles, public-vs-internal notes, no-order cases, owned devices, provider outage/retry, per-device acknowledgments, dead tokens and deleted accounts; all three Flutter parsers consume that wire contract. This is an API/fixture integration check, not three physical phones connected to hosted providers.

Recovery/tooling: a new isolated PostgreSQL round trip preserved all 27 migration checksums, UUID/Clerk linkage, order/payment/stock snapshots and the private support outbox context; unsafe overwrite and non-test restore targets were refused. Six database/CSP tool tests, two file-recovery tests, three terminology-lexer tests, active-copy guard and branding check passed. Evidence: `evidence/recovery/`, `evidence/release-tool-tests.txt`. Prior measured pilot and repeated constrained-pool pricing evidence remain in PERFORMANCE.md; no live load test was performed.

Actual captures: `evidence/release-screenshots/` and `Docs/ui-ux/after/`. Chromium rendered 15 current admin screens at desktop/mobile widths with zero horizontal overflow; the expected Clerk network-loading failure is recorded, and its implemented recovery screen is shown honestly. The gallery contains 94 actual current/historical captures and the comparison PDF has four pages. None are fabricated physical-device captures.

Android build/integrity/publication results and final source CI are recorded in [10_FINAL_HANDOVER.md](10_FINAL_HANDOVER.md). Owned Clerk/FCM/Razorpay, field routing, hosted storage/recovery, legal approval and physical-device acceptance remain separate. No production deployment, authentication cutover or live financial operation occurred.
