# Vendor and Delivery 1.16.3 previews

These are fresh Android builds from the latest reviewed Grozo source, including main checkpoint 827494f and the customer-catalog/demo-seed fixes. Vendor and Delivery application code/design are preserved; their source versions are now 1.16.3+27. No deployed source branch, Render setting, authentication mode, hosted database or live financial operation is changed by building or publishing them.

## Configuration and installation

- Android ARM64, API 24+; split APK versionCode 2027.
- Packages remain `in.grozo.vendor` and `in.grozo.driver`.
- API: `https://grozo-backend-3wdf.onrender.com/api`.
- Socket.io: `https://grozo-backend-3wdf.onrender.com`.
- Clerk: the existing `capable-mutt-6` development instance, using only public client configuration from `android-staging-public.json`. No Clerk secret key or database credential is packaged.
- Development/profile signing, not a Play Store release. The previous private development key is unavailable. The explicit existing development-key-rotation option records the actual signing mismatch; default signature compatibility enforcement remains unchanged. Preserve needed local data, uninstall the old previews, install the new APKs, and sign in again. Uninstalling clears local app data; backend records remain.
- Firebase push remains unconfigured in these previews, as in the preceding preview builds. FCM source/integration and production configuration checks are retained. This does not verify notification delivery, background behavior or GPS on a physical device.

## Access and expected workflow

Clerk sign-in alone does not approve a store or rider. Vendors submit their store application and wait for admin approval/location setup before managing products and orders. Delivery partners submit their rider application and wait for approval/service-area setup before going on duty. Suspension, resource ownership, delivery verification and payment checks remain enforced by the backend. The synthetic catalog's inert vendor-owner records are not sign-in accounts and cannot be claimed through ordinary registration.

## Verification and publication

The `Vendor and Delivery APKs` workflow runs locked dependencies, complete analysis/tests/bundle for each app, and explicit `AUTH_MODE=clerk-test` token/onboarding tests. It then builds the actual APKs and checks signatures, callback manifests, package/version/ABI, the compiled backend URL, ZIP integrity, and secret patterns. Only both successful jobs can publish the pair to a source-specific directory on `artifacts/grozo-android-preview`; existing directories are never overwritten. Test JSONL, manifest and SHA-256 records accompany the APKs. Actual links, fingerprints, checksums and CI outcomes are added after completion; this preparatory document does not claim a successful build or hosted/device login.

These checks use synthetic HTTP/native Clerk fixtures. No personal customer/admin account is used. Provider login, actual hosted role approvals, GPS/delivery completion and device-specific notification behavior remain external acceptance checks. The hosted demo seed has not been applied from this workspace. The independent backend npm audit has previously reported nested Firestore advisories; app build success does not imply that separate audit is green.

## Published downloads and actual verification

- [Vendor 1.16.3 APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/07e7e27957306f168332e54b983212f3c6e47243/clerk-staging/partners-1.16.3-27-af9180f/Grozo-Vendor-Clerk-Test.apk), 51,730,857 bytes. SHA-256: `c810e1e96b592ca87218fb0fd0bc41e27028eec514a0c8f28ac76551a688ba12`.
- [Delivery 1.16.3 APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/07e7e27957306f168332e54b983212f3c6e47243/clerk-staging/partners-1.16.3-27-af9180f/Grozo-Delivery-Clerk-Test.apk), 51,041,199 bytes. SHA-256: `7a3b1b60f8096a91002b877c2bd08cac5725710f9ba8b55336854f69a33b1c5d`.
- [SHA256SUMS](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/07e7e27957306f168332e54b983212f3c6e47243/clerk-staging/partners-1.16.3-27-af9180f/SHA256SUMS).

Source commit: `af9180f246d5233470276faafa51ac4c35f55a21`. Artifact commit: `07e7e27957306f168332e54b983212f3c6e47243`. Both actual downloads returned HTTP 200 with the expected byte count, matching SHA-256, valid ZIP/ARM64 contents and configured backend URL in `libapp.so`. Actual new signing fingerprints are recorded in [the manifest](evidence/partner-1.16.3/manifest.json); both differ from the old previews, so uninstall/install is required, not an in-place update.

[Partner APK workflow 41222394933](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/41222394933) completed successfully in 10m14s, including both analysis/test/bundle commands, the explicit Clerk tests, actual native builds, APK validation and atomic publication of both files.

| App / invocation | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Vendor complete Flutter suite | 538 | 0 | 1 |
| Vendor Clerk token/onboarding suite | 12 | 0 | 0 |
| Delivery complete Flutter suite | 418 | 0 | 1 |
| Delivery Clerk token/onboarding suite | 14 | 0 | 0 |

Counts come from actual Flutter machine `testDone` results, excluding hidden loader events. The existing opt-in visual-capture test in each complete suite remains skipped; no failing test was disabled or skipped for these builds. Each row is its own recorded invocation; these are not combined into a claimed single regression run. Full machine results are published beside the APKs, with summaries in [test-results.json](evidence/partner-1.16.3/test-results.json).

[Baseline run 41222394891](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/41222394891) on the same source passed all 1,273 backend tests (0 failed/skipped), ten pricing concurrency repetitions, all three Flutter jobs, shared authentication and the admin/landing checks. Its aggregate status is **Failure** at the backend's independent `npm audit --omit=dev` step, which still reports the nested Firestore advisories. This is not reported as an entirely green baseline. Exact bounded status and download evidence are in [evidence/partner-1.16.3/](evidence/partner-1.16.3/); complete build logs remain in the linked workflow artifacts.
