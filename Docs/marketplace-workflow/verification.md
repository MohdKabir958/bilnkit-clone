# Marketplace verification

Backend acceptance command, from the repository root:

```sh
QA_EVIDENCE_DIR=Docs/marketplace-workflow/evidence/backend-acceptance node scripts/qa/run_full_backend.mjs
```

The runner creates a fresh local UTF-8 PostgreSQL database, applies every migration, then invokes the whole Jest suite once with `--runInBand --json`. It does not access Neon or the production database.

- Database: `grozo_final_1792612435087_test` on `127.0.0.1`.
- Environment: Node v24.19.0; PostgreSQL 17.11; Prisma 5.22; Linux x64.
- 1130 tests: **1130 passed, 0 failed, 0 skipped**; 47 suites.
- Duration: 456.734 seconds. Exit code: **0**.
- Exact Jest command: `node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/marketplace-workflow/evidence/backend-acceptance/backend-full-run.json`.
- Full log, machine-readable results and summary: `evidence/backend-acceptance/`.
- `source-files.sha256` was checked after the run: no backend source, Prisma schema/migration, test or fixture changed during the run.

The initial complete run had three failures: two public-store field inventories needed the four new intentionally public fields; an administrator contact regression required preserving the existing private owner contact for administrators while customer/rider pickup views use the separate public number. Those were corrected without removing authorization checks. An intermediate run was stopped to finish selected-store ownership checks. A later complete 1,129-test run passed; the final 1,130-test invocation above additionally includes GPS arrival checks and cash retry verification. Runs are retained separately and are never added together.

Admin: **846 tests passed in 54 files**, with no failures, including cash receipts, cancellation wording, role protection and payment normalization. The existing styles and theme are retained. The Clerk/Vite build uses the owned Render HTTPS and Socket.io origins and the current public Clerk development key; it contains no Clerk Secret Key.

Flutter full suites: Customer **462 passed, 2 optional rendering tests skipped**; Vendor **530 passed, 1 optional rendering test skipped**; Delivery **411 passed, 1 optional rendering test skipped**. No functional test was disabled. Three enabled production-widget screenshot harnesses were run separately and each passed. New payment-method, taxonomy and assigned/off-duty GPS assertions were also run as relevant targeted tests after final copy/polling changes; their raw JSON evidence is included. Dedicated Clerk-mode token tests use explicit native-channel fixtures, not hosted provider authentication.

All three Flutter applications passed analysis with no issues. Dart/Flutter analysis uses `ANALYZER_STATE_LOCATION_OVERRIDE=/workspace/.dartServer`, `XDG_CONFIG_HOME=/workspace/.config`, `PUB_CACHE=/workspace/.pub-cache`. Flutter 3.44.9/Dart 3.12.2 are used.

Browser screenshots: 14 actual React captures, including store owner/category setup, cash ledger, handover receipt and mobile overview. All viewport overflow checks passed. They use explicit synthetic API fixtures and carry a fixture banner. The login recovery capture is an actual provider-unavailable state; hosted Clerk sign-in is not claimed. Flutter captures are under `Docs/ui-ux/marketplace/` and use rendering-only native-channel fixtures, not real login.

A rider-controller regression additionally verifies that a pending cash offer is displayed while a pending online order remains hidden. The Android toolchain initially selected a runtime without javac; the full JDK 21 was selected before rebuilding. Android compile/manifest/signature evidence is recorded after builds. Physical devices, live Clerk, FCM push and real Razorpay sandbox operations require the owner's external configuration and remain unverified here.

All three Android profile ARM64 builds passed: version 1.11.0+18 (split versionCode 2018), source commit 2430911. ZIP integrity, application IDs, native Clerk callbacks, signing certificates and the compiled Render API URL were verified. No Clerk Secret Key pattern was found. Build logs, manifests and SHA-256 sums are in `evidence/android/`. These use development signing and have Firebase disabled because owned Android Firebase configuration is unavailable. They are compile evidence; final handover APKs will include the follow-on welcome-page work.
