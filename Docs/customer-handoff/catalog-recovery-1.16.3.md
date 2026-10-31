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
