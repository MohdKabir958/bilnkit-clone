# Customer reference UI verification

Implementation source commit: `37bcfcb`. The backend is unchanged from the prior final handover (1,138-test backend regression); no new hosted/provider verification is claimed for this UI change.

## Final checks

- Full customer suite, one invocation: **472 passed, 0 failed, 3 skipped**, 60.901 seconds. The skips are optional screenshot harnesses. No functional test was disabled.
- Shared UI package: **22 passed, 0 failed, 0 skipped**, 15.522 seconds. Default navigation behavior for vendor/delivery remains unchanged; only the customer's new `dense` option is selected.
- Enabled reference-screen suite: **10 passed, 0 failed, 0 skipped**, 16.597 seconds. Includes actual captures, narrow phone / tablet / 180% text, wishlist/logout isolation, cart opening, ADD pricing, department matching and protected category pagination parameters.
- Flutter analysis: **no issues** for customer, vendor and delivery.
- Terminology guard and its three tests, auth inventory and source whitespace checks pass. “Home & Kitchen” and its matching alias are narrowly allowed as the requested household-merchandise department, not legacy food-preparation wording.

Commands from the relevant package directories:

```sh
flutter analyze --no-pub
flutter test --no-pub --reporter=json
flutter test --no-pub test/reference_home_test.dart --dart-define=GROZO_CAPTURE=true --dart-define=GROZO_CAPTURE_PHASE=customer-reference --reporter=json
```

The initial suite exposed a real fixed-height header overflow at increased text sizes; the header now sizes naturally. Category artwork now uses Flutter's image stream/cache rather than a cross-test-zone static future. Test-only image hooks are restored before painting invariants are checked. Existing UI assertions now check the reference's address casing, managed store chips in View All, and the selected avatar on Profile. Coupon eligibility, provider registration, account logout and other business assertions remain. Failed runs are retained separately; their counts are not combined with the clean full run.

`summary.json` and raw JSON event streams in `evidence/` record the complete results. Screenshots render real production widgets with explicitly synthetic test data and existing original demo image bytes. They are not physical-device captures or generated mock UI. No UI screenshot is used as an application asset.

The Android build is version 1.13.0+20 (ARM64 split versionCode 2020), native Clerk development mode, development signing, and the existing Render HTTPS origin. APK integrity, callbacks, package ID, compiled API URL, signing and public download checks are recorded after the build. Owned Firebase configuration is unavailable, so FCM remains disabled only in this staging APK. Real device installation, hosted Clerk/Google login and live service behavior remain owner/device checks. No secrets are embedded or requested.

Android verification passed: APK size **53,474,807 bytes**, versionCode **2020**, package **in.grozo.customer**, SHA-256 **419a6d301c45c5a375563150892841f234704821010abe3e8adfc5a4a35acba3**. Signature, ZIP integrity, native callbacks, ARM64 ABI and compiled Render URL passed; no Clerk Secret Key pattern was found. Build source is commit `37bcfcb`. Public download evidence is in `evidence/android/public-download.json`.

The dedicated Clerk-mode client token suite also passed **3 tests** using explicit native-channel fixtures (`flutter test --no-pub test/clerk_api_tokens_test.dart --dart-define=AUTH_MODE=clerk-test --reporter=json`). This verifies client delegation, not hosted provider login.
