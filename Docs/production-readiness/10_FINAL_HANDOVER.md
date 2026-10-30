# Grozo production-readiness handover — 26 October 2026

Source/APK commit: **`477d86743fb1accffffcc7ee99c5d4f1a7802821`**, branch **`feature/production-readiness`**. The verified backend checkpoint `fe8b9be` is preserved as an ancestor. All recovered source changes were retained and pushed in reviewable commits. Later documentation/evidence commits do not alter the application source used for these APKs.

| App | Working download | Size | SHA-256 |
| --- | --- | ---: | --- |
| Customer | [Download APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/refs/heads/artifacts/grozo-android-preview/clerk-staging/1.16.0-24/Grozo-Customer-Clerk-Test.apk) | 53639848 bytes | `e675188df66693e8ded89000abaad3f44fcf0588795c37940fc423723b9fbfa4` |
| Vendor | [Download APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/refs/heads/artifacts/grozo-android-preview/clerk-staging/1.16.0-24/Grozo-Vendor-Clerk-Test.apk) | 51730857 bytes | `06c65cc6fc3c67bbb42527839e6f075061f7c414dbf49d8d1100c06cdc66d859` |
| Delivery | [Download APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/refs/heads/artifacts/grozo-android-preview/clerk-staging/1.16.0-24/Grozo-Delivery-Clerk-Test.apk) | 51041199 bytes | `421c12ed980f2c5768d2c5c18111513dc2c31df590166a1c286232925602184d` |


All three URLs returned **HTTP 200** and were actually downloaded and streamed through SHA-256 at **26 October 2026, 10:51 PM IST**. Byte counts and hashes matched the signed local APKs. Download evidence: [publication.json](evidence/android/publication.json). APK binaries were first published in artifact commit `427fdf9` on `artifacts/grozo-android-preview`; the version folder and historical releases are preserved. Current metadata is in the same folder.

Native version: **1.16.0**, Flutter build number **24**, ARM64 split version code **2024**. Package IDs: `in.grozo.customer`, `in.grozo.vendor`, `in.grozo.driver`. ARM64 only; minimum Android 7.0/API24; target API36. These are profile builds signed with the existing Android development certificate, not Play Store production releases. Certificate SHA-256: `7e7927c909310c5ff55ecc744c7a742c13fa8fd9a4a1d7efa7b387a5967f19fe`. All three match the historical certificate. ZIP integrity, ABI, package/version, signature, native Clerk callbacks, actual compiled HTTPS endpoint and support payload checks passed. Scans found no embedded Clerk Secret Key or PostgreSQL credential patterns; this bounded scan is not a universal secret-scan guarantee. Full manifest/permission reports: [Android evidence](evidence/android/).

REST: `https://grozo-backend-3wdf.onrender.com/api`; Socket.io: `https://grozo-backend-3wdf.onrender.com`. Public Clerk development instance: `capable-mutt-6.clerk.accounts.dev`. No server secret is a build input. **The new backend source has not been deployed. New API features require an explicitly approved matching staging rollout.** The APK URL alone does not verify hosted authentication, roles, API compatibility or payment availability.

The source implements all 26 task areas; external acceptance is still partial where hardware, owned providers or deployment/operator approval is required. See the [task-by-task acceptance matrix](00_MASTER_TRACKER.md). The continuation closed gaps in pre-checkout ETA, support alert delivery/deep links, job-health and seller-expiry visibility, and exception-owner assignment while preserving the Grozo theme. Pricing, checkout recovery, inventory disposition, item changes/refunds, dispatch/GPS/OTP, cash, durable jobs, seller compliance, privacy and financial history are retained.

Reviewable continuation commits:

- `ca886b4`: atomic public support-reply outbox, privacy-safe delivery, fenced hashed per-device acknowledgments and retries, plus real PostgreSQL tests.
- `ae413b5`: admin operational monitoring/reasoned retries, FSSAI reminders and approved exception owners, with UI tests.
- `cc8ee53`: matched mobile 1.16, honest checkout estimates, support payload validation/private-thread navigation and regression coverage.
- `477d867`: latest capture tooling and backup/restore verification including support outbox data.

Validation:

| Check | Result |
| --- | --- |
| Complete backend, one invocation | **1238 passed, 0 failed/skipped**, 57 suites, 524240 ms, exit 0 |
| Admin | **859 passed, 0 failed/skipped**, 58 files; TypeScript/Vite build passed |
| Customer Flutter | **480 passed, 0 failed**, 4 capture-only skips |
| Vendor Flutter | **538 passed, 0 failed**, 1 capture-only skip |
| Delivery Flutter | **418 passed, 0 failed**, 1 capture-only skip |
| Flutter analysis | All three: no issues; frozen dependency resolution passed |
| Enabled capture runs | Customer 13, vendor 1, delivery 1 passed; 0 skipped/failed |
| Android builds/integrity | Three matched-source native APK builds and checks passed |
| Fresh database restore | All 27 migration checksums and identity/order/payment/stock/support-outbox snapshots preserved |
| Hosted source CI | **[Complete workflow passed](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40366120188)** for `477d86743fb1accffffcc7ee99c5d4f1a7802821` |

Full commands, logs, exact scopes and earlier diagnostic failures: [test results](06_FULL_TEST_RESULTS.md), [backend regression](../qa/final-backend-regression.md), [CI job evidence](evidence/source-ci-jobs.json). Backend cross-app lifecycle tests use actual local HTTP/PostgreSQL/Socket.io and approved-role fixtures; they do not claim real hosted provider or physical-phone execution. Earlier results are retained separately, never summed into the latest complete run.

Rebuild each app sequentially from the clean source commit:

```bash
source /workspace/.setup/grozo-env.sh
python3 scripts/clerk/build_test_apks.py --app customer --backend-origin https://grozo-backend-3wdf.onrender.com --public-config Docs/clerk/android-staging-public.json --build-name 1.16.0 --build-number 24
python3 scripts/clerk/build_test_apks.py --app vendor --backend-origin https://grozo-backend-3wdf.onrender.com --public-config Docs/clerk/android-staging-public.json --build-name 1.16.0 --build-number 24
python3 scripts/clerk/build_test_apks.py --app driver --backend-origin https://grozo-backend-3wdf.onrender.com --public-config Docs/clerk/android-staging-public.json --build-name 1.16.0 --build-number 24
python3 scripts/clerk/verify_apks.py
```

Build records contain exact Flutter/native flags. Deprecation/SDK-tool-version warnings were not suppressed; builds completed successfully. Do not change source/commit between the three builds if one shared build commit is required.

Screenshots: [current gallery](../ui-ux/client-demo/index.html), [four-page comparison PDF](../ui-ux/client-demo/Grozo-before-after.pdf), [current screen images](../ui-ux/after/), [capture evidence](evidence/release-screenshots/). These are actual implemented Flutter/Chromium UI with explicit synthetic fixtures. The customer reference home/theme is preserved. The Clerk image records its real network-recovery screen; it is not a fabricated completed sign-in. No physical-device screenshots were produced.

Before device acceptance, download the APK, compare SHA-256, allow installation by the browser/file manager and install/update. The certificate matches historical builds; confirm the installed package/certificate if Android rejects an update. Uninstalling erases local app data and is not automatically required. Use synthetic accounts/orders and follow the [device sheet](07_ANDROID_TEST_GUIDE.md).

Remaining external acceptance:

- Owned Clerk configuration/real sessions, native callbacks, approval/suspension and session revocation against a matching approved staging backend/admin deployment.
- **Firebase is unconfigured and deliberately disabled in these APKs.** Source/device ownership/outbox logic remains; background push is not promised. Provide owned Android client/service-account configuration and rebuild before real delivery acceptance.
- Razorpay provider/webhook/async refund checks remain external. Capabilities and totals stay server-controlled; disabled payment mode does not advertise working online payment. No live money was moved or disbursement adapter enabled.
- Physical installation, account switch, offline/background/resume, GPS/navigation, pickup, delivery-code/COD and real evidence capture need the owner's Android devices.
- Licensed road routing, persistent hosted uploads/private evidence, off-site backups/RPO/RTO, long staging soak, seller/tax/legal and Play permission/Data Safety review remain operator work. Free Render storage is ephemeral. Vendor full-screen-intent and battery-exemption permissions require publishing review.
- Previously exposed secrets need secure rotation by the operator. The repaired environment draft is saved but requires review/publication for future clean-machine setup.

[External blockers](09_REMAINING_EXTERNAL_BLOCKERS.md), [deployment steps](05_DEPLOYMENT_GUIDE.md), [operating guide](08_OPERATIONAL_RUNBOOK.md), [security review](03_SECURITY_REVIEW.md) and [file inventory](MODIFIED_FILES.txt) provide detail. Production was not deployed, authentication modes were not switched, no production data was overwritten, and no paid resources or live financial operations were initiated.
