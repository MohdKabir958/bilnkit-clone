# Grozo Customer — backend-configured Android test APK

Version 1.10.1, Android versionCode 2017, ARM64, Android 7/API24 or later. Package: `in.grozo.customer`.

[Download APK](Grozo-Customer-Clerk-Test.apk) — 52,027,398 bytes.

- REST: `https://grozo-backend-3wdf.onrender.com/api`
- Socket.io: `https://grozo-backend-3wdf.onrender.com`
- Clerk development instance: `https://capable-mutt-6.clerk.accounts.dev`
- `AUTH_PREVIEW=false`; this build attempts the real configured backend, without demo login or fake data.
- Source commit: `6b5e7365d8f21d1267d7c65bf411629a84fa5cc6`.
- SHA-256: `e4231044cd369f6fc7e738ec331c0fbeab4a69422dd9b76b84faf5f4259f5024`.
- Signing certificate SHA-256: `7e7927c909310c5ff55ecc744c7a742c13fa8fd9a4a1d7efa7b387a5967f19fe`.

APK build, signature, package/ABI/callback/ZIP checks, compiled API URL and secret-pattern scan passed. Flutter analysis found no issues; all 3 targeted Clerk token/logout fixture tests passed. Live backend reachability and physical-device/Clerk-hosted login are unverified; the workspace proxy blocked Render checks. Matching Clerk backend keys/issuer and Android redirect configuration are required.

This is a development-signed profile test APK, not an owned-key Play Store release. FCM is not configured and payments remain disabled on staging. Configure those separately; this APK does not claim working push or payments. No secret key is embedded.

On Android, open the APK from Downloads and permit installation from the browser/file manager if prompted. It should update an earlier Grozo customer preview signed by the same development certificate. Do not uninstall unless needed: uninstalling removes local data. Old preview APKs remain unchanged elsewhere on this branch.
