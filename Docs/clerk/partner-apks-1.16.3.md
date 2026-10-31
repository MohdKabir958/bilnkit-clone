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
