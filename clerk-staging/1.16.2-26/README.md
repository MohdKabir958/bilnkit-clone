# Customer sign-in handoff update — 1.16.2+26

[Customer APK](Grozo-Customer-Clerk-Test.apk?raw=true) · [SHA-256](SHA256SUMS)

SHA-256: `3a353db7356b71a22eaa4db285b9f6d1cf3f61bcdf15e02d1b7cf0bd267f1dbd`

ARM64 / API 24+, Android versionCode 2026, development-signed profile build. Same package in.grozo.customer and same signing certificate as the previous preview (SHA-256 certificate 7e7927c909310c5ff55ecc744c7a742c13fa8fd9a4a1d7efa7b387a5967f19fe).

Built from app source 2b376f7f47f10fcbaf79ff14c567fea4374cdcb4. Subsequent changes concern tests/diagnostics only. Exact build command is in customer-build.json. Compiled REST: https://grozo-backend-3wdf.onrender.com/api; Socket.io: https://grozo-backend-3wdf.onrender.com. Clerk uses the public capable-mutt-6 development application configuration. No Clerk secret is packaged. Firebase is not configured in this preview.

Valid customer profiles continue to shopping; incomplete profiles open setup. Rejected authentication, missing native sessions and non-customer roles now produce explanations, with old-profile responses prevented from overwriting another session. Roles are not changed: an administrator/store/delivery business identity remains restricted in the Customer app. Use a separate customer identity to shop. No personal account was used for implementation/testing.

Native build, signing, package, version, compiled endpoint and secret-pattern checks passed. Synthetic test/CI evidence is linked in the source handover. This is not a hosted Clerk, physical-device, GPS/FCM or live-payment acceptance claim. No hosted backend/database/authentication setting was changed. Install over the previous preview; the certificate matches. This is not a Play Store production release.

Vendor and Delivery remain at [1.16.1+25](../1.16.1-25/README.md); this customer-only update does not relabel or rebuild them.
