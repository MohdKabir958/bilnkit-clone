# Verified Android downloads

All three files are development-signed **Clerk authentication previews**. No backend is deployed; business operations and FCM are unavailable. Use ARM64 Android 7/API24 or newer. Rotate the disclosed Clerk Secret Key before testing. Real-device/provider login remains unverified here.

The direct links below were downloaded without GitHub authentication: HTTP 200, complete byte counts and SHA-256 matched the built APKs. These immutable GitHub files avoid expiring chat artifact links.

| App | Download | Size (bytes) | SHA-256 |
| --- | --- | --- | --- |
| Customer | [APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/9d9482809a9b7141de9efb2ec89e4b4ec0dc675e/clerk-test/1.10.0-16/Grozo-Customer-Clerk-Test.apk) | 52,027,398 | `779a3dd0d75b7fc7b8e56fdc965779054af95d4583474a89e7f989ee8d82d8d1` |
| Vendor | [APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/9d9482809a9b7141de9efb2ec89e4b4ec0dc675e/clerk-test/1.10.0-16/Grozo-Vendor-Clerk-Test.apk) | 47,863,321 | `2a8d335d7f67b57c21b2f9b1c5f2eeac280105bbaa274f894f9475a55efbc5f4` |
| Delivery | [APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/9d9482809a9b7141de9efb2ec89e4b4ec0dc675e/clerk-test/1.10.0-16/Grozo-Delivery-Clerk-Test.apk) | 48,615,815 | `e49d5266bbbd3507154e16328673a623b5aa3bb6309c3b5a82c9140a8752e7f2` |

Artifact branch: `artifacts/grozo-android-preview`. Artifact commit: `9d9482809a9b7141de9efb2ec89e4b4ec0dc675e`. APK source commit: `490b6707b3b09594c24902a5bee1c19314e98040`. Later source commits add backend/tests/docs without changing the application sources in these APKs. Earlier preview downloads on the artifact branch were preserved.

Version name `1.10.0`, base Flutter build `16`, actual Android manifest version code `2016` (ARM64 split offset). Package IDs are unchanged. Signing certificate SHA-256: `7e7927c909310c5ff55ecc744c7a742c13fa8fd9a4a1d7efa7b387a5967f19fe`. This is Android development signing, not an owned Play Store release key.

See [installation and manual checks](10_android_manual_test_guide.md), [deployment steps](07_neon_render_vercel_deployment.md), [complete APK manifest](evidence/android/manifest.json), [checksums](evidence/android/SHA256SUMS), and [actual download verification](evidence/android/download-verification.json). The manifest includes permissions, endpoints, SDK/public environment, signature/ZIP/ABI checks and exact build commands. Raw build and manifest-verification output is preserved beside it.
