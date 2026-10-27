# Customer Clerk-to-shopping handoff fix

The provided screenshot proves native Clerk sign-in completed, but does not identify the backend HTTP result. No personal account was accessed, tested, signed in, modified or demoted. All tests use synthetic native/HTTP fixtures.

## Confirmed source defect

Customer SessionProvider.restore rejected any non-STUDENT business role (including ADMIN) by silently ending the Grozo app session. Clerk remained signed in, so the same signed-in welcome page reappeared with no explanation. A backend 401/403/404 or absent SDK token could produce a similar loop. Clerk authentication alone does not grant customer business access. Backend/native errors cannot be diagnosed from the screenshot alone; an administrator role is a possible cause, not a verified account lookup.

## Implemented correction

- Preserve the existing Grozo theme and show an accessible, specific explanation for a non-customer role, rejected profile or missing native session token. Existing customer/partner/admin access restrictions remain unchanged; no account role is altered.
- Initialize the native Clerk identity before starting profile restoration, then let the existing AuthGate route valid customer profiles to shopping or incomplete profiles to setup.
- Use a single native token for the profile request. Ignore outdated profile responses after another restore, logout/expiry or native account switch; an old 401 cannot expire a newer successful session.
- Keep backend/network/429/5xx trouble retryable without granting access. Clear the previous access error only when a new check starts or succeeds.
- Customer version 1.16.2+26; other apps' versions are unchanged.

## Verification

Customer Flutter analysis passed locally with no issues. Local Flutter tester compilation prerequisites were checked, but actual runtime was blocked by its local socket restriction. The narrowly requested test-process escalation could not be reviewed because of an approval usage limit; it was not executed or bypassed. Existing authorized GitHub CI runs the dedicated Clerk-mode suite explicitly, the full customer suite/analysis/bundle and the shared authentication UI tests. [CI run 40465812093](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40465812093), tested source b7af9985f79aec85ec29dbd3039b582805fd9481: **all 12 dedicated Clerk handoff tests passed**, including the real entry component's visible role explanation. The complete Customer dependency/analysis/test/bundle job, shared authentication UI tests, Vendor and Delivery checks, Admin and landing jobs also passed. The complete backend invocation also passed: **1266 passed, 0 failed/skipped, exit 0**, followed by ten successful constrained-pool pricing repetitions. All jobs in that same CI run are green. The backend test step took 361 seconds; exact job timestamps, result annotations and artifact metadata are saved in evidence/. The complete backend log/JSON and pricing logs are preserved in the linked GitHub artifact; the workspace proxy blocks its download redirect, so no local full log is fabricated from partial output. Exact job metadata, bounded check annotations and the complete short Clerk test log are retained under evidence/. No test was skipped or disabled to obtain this result.

The initial dedicated run had 11 service tests pass and a UI test that stopped pumping before cached native/storage callbacks finished. A subsequent barrier blocked those frames and timed out. The corrected fixture drives both native callbacks and Flutter frames until the actual provider outcome, bounded to 50 iterations. All original visible-error, role/status and no-exception assertions remain; production access checks were not relaxed. A missing-braces analyzer issue in that new test was corrected before the final run. The failed-run evidence is preserved as ci-initial-handoff-failure.json.

Dedicated command from apps/customer_app:

```sh
flutter test --no-pub --dart-define=AUTH_MODE=clerk-test test/clerk/customer_handoff.dart --reporter=expanded
```

The dedicated file is explicitly named in CI because it requires Clerk compile-time configuration; the ordinary complete Flutter tests also run unchanged with their existing configuration. This is not hosted Clerk authentication or a physical-device test. The prohibited personal account is never an input.

If the new app reports an administrator/store/delivery account, use a separate customer account. Do not demote or overwrite a business identity simply to make shopping work. If it reports rejected authentication, the deployed backend/Clerk configuration and precise non-secret error code must be checked separately, without copying bearer tokens.

## Download and install

[Customer 1.16.2+26 APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/e3e150d5cec080ea56c9f1c78a41d0eaa24434d4/clerk-staging/1.16.2-26/Grozo-Customer-Clerk-Test.apk)

SHA-256: `3a353db7356b71a22eaa4db285b9f6d1cf3f61bcdf15e02d1b7cf0bd267f1dbd`

Downloaded after publication: HTTP 200, 53,639,848 bytes, matching SHA-256. ARM64 / Android API 24+, versionName 1.16.2, split-ABI versionCode 2026. The same package and signing certificate permit updating the previous preview in place. Signature, APK manifest and actual compiled hotfix error strings were checked. Build log, JSON and download/source-equivalence proofs are committed in evidence/.

APK build source is 2b376f7f47f10fcbaf79ff14c567fea4374cdcb4. Subsequent commits concern tests/CI only; lib, Android, pubspec and shared UI runtime paths match the tested source exactly. REST is https://grozo-backend-3wdf.onrender.com/api; Socket.io uses that HTTPS origin. Clerk uses the existing capable-mutt-6 development instance. Firebase is unconfigured in this preview; no secret key is packaged. Vendor and Delivery remain at their previous 1.16.1+25 versions.

Install over the previous customer APK and tap Continue to shopping. A valid customer profile opens shopping; an incomplete profile opens setup. An explicit administrator/vendor/delivery account explanation requires a separate customer login. A rejected session/profile or connection error requires the corresponding retry/sign-out/support step. The screenshot alone does not establish which backend response occurred, and no lookup of the personal account was performed.

This is a development-signed profile preview, not a Play Store release or proof of hosted Clerk/device/GPS/FCM/payment acceptance. No production deployment, hosted database modification, authentication-mode switch or live financial operation was performed.

Complete raw CI artifacts:

- [admin-b7af9985f79aec85ec29dbd3039b582805fd9481](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40465812093/artifacts/12716860031)
- [backend-and-pricing-b7af9985f79aec85ec29dbd3039b582805fd9481](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40465812093/artifacts/12716841424)
- [customer-clerk-handoff-b7af9985f79aec85ec29dbd3039b582805fd9481](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40465812093/artifacts/12716149537)
