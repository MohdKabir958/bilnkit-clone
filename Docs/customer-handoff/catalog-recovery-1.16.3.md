# Customer nearby-store recovery (1.16.3+27)

The reported phone screenshot contains the literal text `Can't load nearby stores` and `Check your connection, then try again`. These are the unconditional failure strings in the published 1.16.2 APK's source (`2b376f7`). That APK predates the catalog diagnostics now merged into backend/source checkpoint `827494f`. Deploying a Node backend does not replace an installed Flutter executable.

## Confirmed bug and correction

The old Home widget presents every discovery exception as a network outage. `GET /api/v1/vendors/nearby` requires an authenticated customer and an owned selected/default delivery address. A missing address returns HTTP 400 `ADDRESS_REQUIRED`, independently of internet connectivity. Other possible failures include an expired session, an unavailable server and an incompatible response. The screenshot does not establish which authenticated response occurred.

The updated app parses the non-sensitive HTTP status/code/field, retains distinct address/auth/server/timeout/format guidance and offers the address picker when appropriate. This update also gives explicit address failures a location icon and `Choose where to deliver` heading. Existing Grozo colors, layout, store cards and product cards are preserved. Default-address ownership and all serviceability/auth/payment checks remain server controlled. Opening Home never overwrites an explicit address selection.

A real production-widget test injects the backend's address-required contract, loads Home, verifies the specific message, taps the recovery button and confirms the actual address screen opens. Existing catalog tests cover 404, 429, 503, malformed responses, successful retries and address/account isolation.

## Build and installation

The `Customer catalog fix APK` workflow builds from committed source on the dedicated fix branch. It runs customer analysis, the complete customer test suite, the bundle check and the dedicated Clerk handoff suite before building/validating/publishing the APK. Baseline CI separately runs the existing full backend/admin/vendor/delivery/shared-UI checks. Build and test results must be reported from the completed run; preparing this file does not claim they passed.

- Version: 1.16.3+27; ARM64 split Android versionCode 2027; API 24+.
- REST: `https://grozo-backend-3wdf.onrender.com/api`.
- Socket.io: `https://grozo-backend-3wdf.onrender.com`.
- Clerk: existing `capable-mutt-6` development application, public client configuration only.
- New development signing key: the previous workspace's private development keystore is unavailable. The verification tool still rejects certificate changes by default. This preview uses an explicit development-only rotation option, records the actual fingerprint/mismatch and does not claim update compatibility. No private keystore enters Git.
- Preserve any needed local data, uninstall the old preview, install the new APK and sign in again. Uninstalling clears local device data; it does not delete backend records.
- Add/select a genuine delivery address in an enabled service city. Products appear only from approved, serviceable stores. An unsupported city is not fixed by inventing GPS coordinates or bypassing backend checks.
- FCM is unconfigured in this preview, as in the previous preview. This is not a Play Store release.

Published APK, manifest and SHA-256 files use a source-specific folder on `artifacts/grozo-android-preview`; the workflow refuses to overwrite an existing folder. No production source branch, Render environment, authentication mode, database or financial operation is changed by this workflow.

## External checks still required

The workspace proxy returned HTTP 403 on connection attempts to the hosted backend and official Flutter distribution host. Local SDK tests/builds cannot run here; the workflow uses GitHub's standard Flutter/Android environment. No personal account or credential was used. The exact error for the reported account requires the authenticated phone request or a non-sensitive backend error code; do not copy bearer tokens or session headers. Physical-device Clerk login, address selection and store discovery must be checked after installing the new APK.

## Published download and actual results

[Download Customer 1.16.3 APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/5deab8b49ec472dd6ed0583bc57e637d7103c7c7/clerk-staging/1.16.3-27-cf34106/Grozo-Customer-Clerk-Test.apk)

SHA-256: `ae14e8a72e25f21fd354c1e9e0b7730fe4cea4b26284a7086f965165eb5e3141`.

The actual published APK was downloaded again: HTTP 200, 53,639,848 bytes, matching hash and valid ZIP. Its compiled native app contains the configured backend `/api` URL, the new `Choose where to deliver` prompt and specific server-unavailable guidance. Its signing fingerprint is `9beae12cb68d1e95064fb80d867b06e237d079209f20cfd430c86fa166f5fcd2`; it differs from the old preview, so uninstall/install is required as described above. Build source: `cf34106ee60a947282650d2f8a2bd922b92f375a`; artifact commit: `5deab8b49ec472dd6ed0583bc57e637d7103c7c7`.

[Customer build/publication run 41212631228](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/41212631228) passed customer dependency resolution, analysis, the complete test suite, bundle compilation, dedicated native Clerk handoff regressions, Android compilation, signature/manifest/ABI/backend/secret-pattern verification and publication. The build job took 8m45s. These are synthetic automated regressions and an actual compiled APK, not a physical-device login or authenticated hosted-catalog test.

[Complete baseline run 41212631262](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/41212631262) passed the complete backend test invocation: **1,266 total, 1,266 passed, 0 failed, 0 skipped**, plus ten pricing concurrency repetitions. All three Flutter jobs, shared authentication tests, 12 dedicated Clerk handoff tests, admin tests/build and landing checks passed. **The aggregate baseline run failed** at the backend's separate `npm audit --omit=dev` step. It is not reported as an entirely green CI run.

The audit reports four moderate affected packages along the nested `@google-cloud/firestore-api@0.2.0 -> google-gax@5.0.8 -> rimraf@5.0.10 -> glob@10.5.0 -> minimatch@9.0.9` chain. Advisory URLs are [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). A normal `npm audit fix --package-lock-only --ignore-scripts --omit=dev --dry-run --json` proposed zero changes and retained the findings. Current Firestore requires API `^0.2.0`, which requires google-gax `^5.0.0`; latest google-gax 5 is 5.0.8. Latest API 0.7.1 uses google-gax 6, but forcing that outside the parent SDK's range is not a verified compatibility fix. No dependency override, downgrade, audit suppression, Firebase removal or SDK major upgrade was committed for this customer UI fix. Upstream backports or a separately tested Firebase/Firestore dependency upgrade are required to clear this audit. This is a genuine security follow-up, not evidence of the phone's catalog error.

Exact download, build-source and audit evidence is in `evidence/catalog-1.16.3/`. Earlier failed runs remain available: the first Android prerequisite setup was replaced with the supported preinstalled tools, and a new widget test's blanket `pumpAndSettle` was replaced with bounded waits for its actual UI outcomes because Home has repeating loading animations. Its HTTP request, visible message, button navigation and no-exception assertions remain enforced. No tests or audit checks were disabled.
