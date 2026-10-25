# Rider registration verification

Implementation source: `be665d1a71b91bc32c5935ee4108740db9bc1eba`. App version **1.14.1+22**, ARM64 versionCode **2022**.

## Complete runs

- Full backend: **1,147 passed, 0 failed, 0 skipped; 47 suites; exit 0**, **403.594 seconds**, one complete Jest invocation. Fresh isolated PostgreSQL 17.11 database `grozo_final_1792952198761_test` at `127.0.0.1`; all migrations applied first. Node v24.19.0, Linux x64, UTC. Started 2026-10-25T18:16:55.060Z; completed 2026-10-25T18:23:38.697Z. No live database used. Complete log, machine-readable Jest output and summary are in `evidence/backend-final/`.

- Delivery Flutter full suite: **414 passed, 0 failed, 1 skipped**, **58.198 seconds**. The sole skip is the existing optional screenshot harness, not a disabled functional test.
- Explicit Clerk-mode suite: **14 passed, 0 failed, 0 skipped**, **14.156 seconds**. Covers fresh identity routing, approval decisions, suspension, wrong-role/missing-link/outage messages, visible phone and vehicle validation, double submission, Cycle without a plate, small-screen/large-text layout, actual auth-gate registration-to-pending transition, native SDK token delegation and logout.
- Delivery Flutter analysis: **no issues**. Backend TypeScript build: **exit 0**.
- Terminology guard and its three tests pass. The one additional exact allowance is the internal STUDENT role used only to recognize a new identity needing a rider application.
- Auth inventory is regenerated after formatting, and `--check` passes. Source whitespace checks pass; original backend process logs retain raw formatting.

Commands:

```sh
# Repository root; one full Jest invocation against a fresh isolated local database:
QA_EVIDENCE_DIR=Docs/rider-registration-fix/evidence/backend-final node scripts/qa/run_full_backend.mjs

# apps/driver_app:
flutter test --no-pub --reporter=json
flutter test test/clerk_rider_onboarding_test.dart test/clerk_api_tokens_test.dart --no-pub --dart-define=AUTH_MODE=clerk-test --dart-define=GROZO_CAPTURE=true --dart-define=GROZO_CAPTURE_PHASE=rider-registration --reporter=json
flutter analyze --no-pub

# backend:
npm run build

# Repository root:
python3 scripts/qa/check_ui_terminology.py
python3 scripts/qa/test_terminology_guard.py
node scripts/clerk/inventory.mjs --check
```

The first targeted backend run is retained in `evidence/backend-targeted/`: **37 passed, 1 failed**. The new test expected a suspended rider's onboarding request to return HTTP 200, but existing Clerk verification correctly rejects suspended partners before any route handler with HTTP 403 / ACCOUNT_SUSPENDED. That assertion now explicitly verifies denial, and the mobile client recognizes the suspension code. Authentication was not weakened and no test was skipped. The complete regression was run after this correction; final totals come from that one invocation.

These tests use real local PostgreSQL, the official Clerk verifier with locally signed fixture tokens and explicit provider HTTP/native-channel fixtures. They do not establish real Clerk-hosted authentication or physical-device behavior. All tests and screenshots use synthetic identities; no production data or payments are touched.

## Android APK

```sh
source /tmp/grozo-welcome-env.sh
python3 scripts/clerk/build_test_apks.py --app driver --backend-origin https://grozo-backend-3wdf.onrender.com --public-config Docs/clerk/android-staging-public.json --build-name 1.14.1 --build-number 22
python3 scripts/clerk/verify_apks.py --app driver
```

Build exit 0; application source clean and committed. Package **in.grozo.driver**, **50,975,607 bytes**, SHA-256 **4381e963485245f2c678025f26deedce5492cef2096ac224111045620e6b051a**. Android signature, existing callbacks, ZIP integrity, ARM64 ABI, compiled Render HTTPS API URL and absence of Clerk Secret Key patterns pass. Same development signing certificate as previous personal-test APKs. Build metadata and download verification are in `evidence/android/`.

[Download updated delivery APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/afa6fa8b85bf0537f78976534b52989590c77555/clerk-staging/1.14.1-22/Grozo-Delivery-Clerk-Test.apk). Artifact commit: `afa6fa8b85bf0537f78976534b52989590c77555`.

The actual widget-rendered registration captures are in `screenshots/` and `../ui-ux/rider-registration/delivery/`. No generated mock screen or physical-device capture is claimed. Customer and vendor UI/theme files are untouched.

## Remaining operator/device checks

Deploy this backend source to Render before using the APK; the app needs authenticated `GET /api/partner/driver/onboarding`. No new schema migration, secret, paid instance or database reset is needed. Native Clerk/Google login on the owner's phone, GPS permission/service area, live approval-to-duty-to-offer flow and real-device installation remain operator/device checks. The APK is an ARM64/API24+ profile build with development signing, not a Play Store release. Owned Firebase configuration remains absent, so FCM is disabled only in this staging APK; FCM source is preserved. Current hosted payment configuration remains unchanged.

Public APK download returned **HTTP 200** with the complete expected byte count and matching SHA-256. Direct Render readiness/onboarding checks were blocked by the workspace network proxy (`Tunnel connection failed: 403 Forbidden`); that is not evidence of an HTTP 403 response from the backend itself. Details are in `evidence/backend-public-check.json`. Live deployment remains unverified here.
