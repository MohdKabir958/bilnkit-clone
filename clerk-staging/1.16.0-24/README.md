# Grozo 1.16.0+24 — connected staging APKs

Source commit: `477d86743fb1accffffcc7ee99c5d4f1a7802821`, feature/production-readiness. All three APKs were built sequentially from that same clean application source.

- [in.grozo.customer](Grozo-Customer-Clerk-Test.apk) — SHA-256 `e675188df66693e8ded89000abaad3f44fcf0588795c37940fc423723b9fbfa4`
- [in.grozo.vendor](Grozo-Vendor-Clerk-Test.apk) — SHA-256 `06c65cc6fc3c67bbb42527839e6f075061f7c414dbf49d8d1100c06cdc66d859`
- [in.grozo.driver](Grozo-Delivery-Clerk-Test.apk) — SHA-256 `421c12ed980f2c5768d2c5c18111513dc2c31df590166a1c286232925602184d`

ARM64, Android 7.0/API24 minimum, target API36; native version code 2024. Development-signed profile builds; signatures match historical APKs. Package IDs remain in.grozo.customer, in.grozo.vendor and in.grozo.driver.

REST: https://grozo-backend-3wdf.onrender.com/api
Socket.io: https://grozo-backend-3wdf.onrender.com
Clerk development instance: capable-mutt-6.clerk.accounts.dev

These APKs embed only public authentication configuration. Binary checks passed for ZIP integrity, package/version/ABI/signature/callbacks, real compiled API URL, latest support payload and Clerk-secret/database-credential patterns. See manifest.json, compiled-feature-checks.json and SHA256SUMS.

The new backend source was NOT deployed by this release. New API features require an explicitly approved matching staging rollout. A URL in an APK does not prove backend/version alignment or hosted authentication. Genuine Clerk session and physical-device acceptance remain unverified here.

Firebase client configuration is not supplied: initialization is deliberately disabled in these APKs. Manual/socket refresh remains available; background push is not promised. Payments remain backend-controlled; real Razorpay processing was not verified, and no live financial operation occurred. These are not Play Store production releases. Review vendor full-screen/battery-exemption permissions before store publication.

Download an APK using its raw link, compare SHA-256, allow your browser to install unknown apps, then install/update. If Android rejects an update, check its package/signing certificate before considering uninstall (which removes local app data). All historical artifact directories are retained.
