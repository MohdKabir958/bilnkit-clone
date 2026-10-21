# 8. Verification and actual limits

The implementation supports isolated Clerk mode. Production cutover is not activated. Automated fixtures, native compilation and APK integrity checks are complete; hosted Clerk authentication and physical-device acceptance remain pending.

## Reproducible commands

From the repository root:

```sh
# Requires a private backend/.env pointing to LOCAL PostgreSQL with CREATE DATABASE permission.
# No QA_TEST_PATH for the full run. This creates a fresh UTF-8 *_test database.
QA_EVIDENCE_DIR=Docs/clerk/evidence/backend-release node scripts/qa/run_full_backend.mjs
node --test scripts/clerk/hosted_admin_config.test.mjs
node scripts/clerk/inventory.mjs --check
python3 scripts/qa/check_ui_terminology.py
```

From `backend`: `npm run build`.

From `web/super_admin`: `npm test -- --reporter=json --outputFile=tests.json`, then `npm run build`. A separate Clerk-test build was run with public development configuration and an explicit unconfigured `.invalid` API origin; it is compile evidence, not a deployed portal.

From each `apps/customer_app`, `apps/vendor_app`, `apps/driver_app`:

```sh
flutter analyze --no-pub
flutter test --no-pub --concurrency=2 --machine
flutter test --no-pub test/clerk_api_tokens_test.dart --dart-define=AUTH_MODE=clerk-test --reporter expanded
```

From `packages/kraveo_ui`: `flutter analyze --no-pub` and `flutter test --no-pub --reporter expanded`.

Build/verify APKs from the root using `scripts/clerk/build_test_apks.py` and `scripts/clerk/verify_apks.py` as in document 03. The verification script requires `ANDROID_HOME` and an appropriate JDK. Each build JSON contains its exact command, source commit, mode, endpoints and signing description. Builds use profile mode, ARM64, explicit development signing and omitted unowned Firebase configuration. Kotlin compilation is included in all three successful APK builds; a standalone implementation compile is also preserved for Customer.

## Results and evidence

| Check | Actual result | Evidence |
| --- | --- | --- |
| Complete backend, one invocation, fresh database | 1093 passed, 0 failed, 0 skipped; 44 suites; exit 0; 374.467s | [final backend report](../qa/final-backend-regression.md), `evidence/backend-release/` |
| Backend TypeScript build | Passed | `evidence/backend-build.txt` |
| Admin tests | 819 passed, 0 failed, 0 skipped | `evidence/admin/tests.json` |
| Admin builds | Default legacy build and isolated Clerk-test build passed | `evidence/admin/build.txt`, `clerk-test-build.txt` |
| Customer analysis | No issues | `evidence/mobile/customer-analysis.txt` |
| Vendor analysis | No issues | `evidence/mobile/vendor-analysis.txt` |
| Delivery analysis | No issues | `evidence/mobile/driver-analysis.txt` |
| Customer full Flutter suite | 458 passed, 0 failed, 2 skipped; exit 0 | `evidence/mobile/customer-full-summary.json` and `.jsonl` |
| Vendor full Flutter suite | 528 passed, 0 failed, 1 skipped; exit 0 | `evidence/mobile/vendor-full-summary.json` and `.jsonl` |
| Delivery full Flutter suite | 408 passed, 0 failed, 1 skipped; exit 0 | `evidence/mobile/driver-full-summary.json` and `.jsonl` |
| Clerk-mode mobile API fixtures | 3 passed per app; no legacy-token substitution; logout blocks injection | `evidence/mobile/*-clerk-mode-tests.txt` |
| Shared mobile session/UI package | Analysis clean; 18 tests passed | `evidence/mobile/shared-*` |
| CSP security configuration tests | 3 passed, 0 failed | `evidence/csp-tests.txt` |
| Active terminology audit | Passed with exact compatibility allowances | `evidence/terminology.txt` |
| Android APK builds | Customer, Vendor and Delivery passed | `evidence/android/*-build.json` and `.log` |
| APK integrity/signatures/IDs/callbacks/ABI | Passed; no Clerk Secret Key pattern found | `evidence/android/manifest.json`, `*-apk-verification.txt` |
| Public APK downloads | All three HTTP 200, complete byte counts and SHA-256 matches, no auth header | `evidence/android/download-verification.json` |

The four skipped Flutter tests are pre-existing opt-in screenshot-capture tests. No authentication/business regression test was disabled or skipped to make this change pass. Early analysis found lints in newly added fixture tests; those were fixed and analysis rerun cleanly. A reporting-wrapper parsing error after successful Flutter tests was corrected, and the final machine-readable full-suite runs completed with actual exit 0.

The backend full run exercises existing business regressions in isolated legacy mode and the new Clerk verification/authorization suite in explicitly selected Clerk-test mode. New tests use the official SDK's cryptographic verification with locally generated RSA keys and signed webhook fixtures; only Clerk provider HTTP responses are substituted. They cover missing/invalid/forged/expired/wrong-issuer/party/audience tokens, online revocation/suspension/outage, native authorized-party policy, subject/UUID linkage/conflicts/concurrency, pending partner applications, explicit admin assignment, role/foreign-resource isolation, duplicate/stale/deletion webhooks, socket room restrictions, logout/account switching, device ownership, durable deletion retry and independent Razorpay signatures. These are not Clerk-hosted login results.

An earlier full run failed on nondeterministic payment reconciliation when concurrent rows shared `createdAt`. The query now orders by timestamp **and ID**; the regression forces tied timestamps and uses one captured clock advanced exactly a minute. No assertion was weakened. Another run while Android builds competed for CPU timed out during the existing 80-product inventory setup, causing a downstream search assertion to fail. Its complete failed output is retained. The final suite is scheduled without competing builds; no timeout was increased and no inventory assertion was removed. The final report must be read as a single full invocation, never a sum of targeted runs.

Earlier development attempts are not presented as acceptance evidence. `backend-full/` preserves the initial failed full run; `backend-final/` records an intermediate successful run before later privacy corrections; `backend-handover/` preserves the CPU-contention failure. The final source is assessed by `backend-release/`. Existing baseline evidence is historical and not relabelled as Clerk verification.

## External checks still pending

No staging backend/database/admin was deployed. No physical phone or working emulator is attached. The workspace proxy rejects the Clerk frontend hostname; the disclosed Secret Key was not used. Real email verification/recovery, Google callbacks, encrypted persistence on hardware, session renewal/revocation with the actual provider, deployed CSP/CORS/socket behavior, owned FCM delivery and real Razorpay sandbox operations remain **not verified**. Follow documents 02, 07 and 10 before final cutover approval.

Existing plugin Java/Kotlin/Gradle deprecation warnings, SDK XML tooling warnings, the Vite chunk-size warning and Jest's pre-existing forceExit/open-handle notice remain in raw logs. Owned production signing and Firebase configuration are not available; Play Store release builds and notification delivery are not claimed.

Toolchain: Flutter 3.44.9, Dart 3.12.2, Node 24.19.0, PostgreSQL 17.11, Prisma 5.22, Java 21, Gradle 9.1, AGP 9.0.1 and Kotlin 2.3.20. Official Clerk Android UI 1.2.1, `@clerk/express` 2.1.81 and maintained `@clerk/react` 6.18.0 are pinned through build/package configuration and locks.
