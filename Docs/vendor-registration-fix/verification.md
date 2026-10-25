# Verification — vendor registration fix

Application source: **c5d8636c02deedbd67cc1fb7fe0411cc0db8eff8**. Vendor **1.14.0+21**, ARM64 versionCode **2021**.

## Complete clean runs

- Backend: **1,142 passed, 0 failed, 0 skipped; 47 suites; exit 0; 387.984 seconds**, one complete Jest invocation. Fresh isolated PostgreSQL 17.11 database `grozo_final_1792949425395_test`, host `127.0.0.1`; all migrations applied before testing. Node v24.19.0, Linux x64, UTC. No live database used.
- Vendor full Flutter suite: **531 passed, 0 failed, 1 skipped; 89.998 seconds**. The sole skip is the pre-existing optional visual capture, not a disabled functional test.
- Explicit Clerk-mode onboarding/token suite: **12 passed, 0 failed, 0 skipped; 16.698 seconds**. Includes real auth-gate widget registration-to-pending routing, visible business phone/no custom password, validation, duplicate taps, malformed server success, role-conflict error preservation, all approval states, fresh SDK tokens, logout and category retry. Native Clerk and HTTP are explicit fixtures, not a claim of hosted-provider/device verification.
- Vendor Flutter analysis: **no issues**. Backend TypeScript build: **exit 0**.
- Terminology guard and its three regression tests pass. Two exact new allowances cover the internal STUDENT database role and the existing `/categories?for=restaurants` API filter. Neither is user-facing copy.
- Authentication inventory is refreshed and checks clean. Source whitespace check passes (raw process logs retain their original formatting).

Commands from repository root unless a package directory is specified:

```sh
QA_EVIDENCE_DIR=Docs/vendor-registration-fix/evidence/backend-final node scripts/qa/run_full_backend.mjs
# Runner invokes, once, from backend:
node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/vendor-registration-fix/evidence/backend-final/backend-full-run.json

# apps/vendor_app:
flutter test --no-pub --reporter=json
flutter test test/clerk_vendor_onboarding_test.dart test/clerk_api_tokens_test.dart --no-pub --dart-define=AUTH_MODE=clerk-test --dart-define=GROZO_CAPTURE=true --dart-define=GROZO_CAPTURE_PHASE=vendor-registration --reporter=json
flutter analyze --no-pub

# backend:
npm run build

# Root:
python3 scripts/qa/check_ui_terminology.py
python3 scripts/qa/test_terminology_guard.py
node scripts/clerk/inventory.mjs --check
```

Detailed backend log, machine-readable Jest result and runner summary are in `evidence/backend-final/`. Flutter JSON event streams and summary are in `evidence/flutter/`. An earlier full run is retained in `evidence/backend-full/`: it had **1,141 passes and 1 failure**, a newly added assertion expecting HTTP 403 for a read endpoint whose existing ownership guard correctly conceals inaccessible stores with 404. The final assertion verifies the protected product-creation action returns 403 for an unapproved applicant. No permission check or functional test was disabled. Earlier targeted attempts also record missing test-category setup and an incorrect expectation for the existing spaced canonical phone format; both fixture expectations were corrected. The complete suite was then rerun once, successfully.

## Android artifact

```sh
source /tmp/grozo-welcome-env.sh
python3 scripts/clerk/build_test_apks.py --app vendor --backend-origin https://grozo-backend-3wdf.onrender.com --public-config Docs/clerk/android-staging-public.json --build-name 1.14.0 --build-number 21
python3 scripts/clerk/verify_apks.py --app vendor
```

Build exit 0. Clean committed app source. Package `in.grozo.vendor`; **51,205,925 bytes**; SHA-256 **15608283d120081973a302b66c71303eda97702c3aaa7335e189fe55f1ba4d36**. ZIP integrity, Android signature, existing callback/deep-link declarations, ARM64 ABI, compiled Render API URL and absence of Clerk Secret Key patterns pass. Same development signing certificate as previous previews. Public download evidence is in `evidence/android/public-download.json`.

[Download vendor APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/61dc396ad8d61959f9bb62e9a7286e9176c54ce4/clerk-staging/1.14.0-21/Grozo-Vendor-Clerk-Test.apk). Artifact branch commit: `61dc396ad8d61959f9bb62e9a7286e9176c54ce4`.

Actual implemented Flutter captures, with synthetic data, are in `screenshots/` and `../ui-ux/vendor-registration/vendor/`. The reference customer design is untouched. The backend adds one authenticated onboarding endpoint and reuses existing schema fields; no new migration or secret is required.

## Remaining operator/device verification

Deploy the updated source to Render before testing this APK. Use a store-owner identity, submit the application, review it in Approvals, configure city/location/coverage, approve products and test a serviceable order. Real hosted Clerk/Google login, phone installation, GPS, push and the live order cycle are not claimed as verified here. Direct Render checks from this workspace were blocked by the network proxy (`Tunnel connection failed: 403 Forbidden`), so this is not evidence that the deployed backend itself returned HTTP 403 or that a deployment has completed. Owned Firebase configuration remains absent from this staging APK; FCM source, payment verification, inventory, dispatch and other existing security rules remain present and regression-tested.
