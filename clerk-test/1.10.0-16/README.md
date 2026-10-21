# Grozo Clerk Android authentication previews — 1.10.0, Flutter build 16

Android manifest versionCode 2016 (ARM64 split offset). Development signing, ARM64 only, Android API24+.

These APKs are authentication previews: the backend is not deployed, marketplace operations are unavailable, and owned Firebase configuration is omitted. Rotate the disclosed Clerk Secret Key before testing. Use synthetic accounts you control. Real-device/provider login remains to be verified by the owner. No production cutover is activated.

Source commit: `490b6707b3b09594c24902a5bee1c19314e98040`. SDK: official Clerk Android UI 1.2.1 via a Kotlin bridge. The apps contain only a public development key, not the backend Secret Key.

- [Grozo-Customer-Clerk-Test.apk](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/artifacts/grozo-android-preview/clerk-test/1.10.0-16/Grozo-Customer-Clerk-Test.apk) — 52,027,398 bytes; SHA-256 `779a3dd0d75b7fc7b8e56fdc965779054af95d4583474a89e7f989ee8d82d8d1`
- [Grozo-Vendor-Clerk-Test.apk](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/artifacts/grozo-android-preview/clerk-test/1.10.0-16/Grozo-Vendor-Clerk-Test.apk) — 47,863,321 bytes; SHA-256 `2a8d335d7f67b57c21b2f9b1c5f2eeac280105bbaa274f894f9475a55efbc5f4`
- [Grozo-Delivery-Clerk-Test.apk](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/artifacts/grozo-android-preview/clerk-test/1.10.0-16/Grozo-Delivery-Clerk-Test.apk) — 48,615,815 bytes; SHA-256 `e49d5266bbbd3507154e16328673a623b5aa3bb6309c3b5a82c9140a8752e7f2`

See the source branch `Docs/clerk/10_android_manual_test_guide.md` for installation/security checks and `07_neon_render_vercel_deployment.md` for deployment. Compare SHA256SUMS before installing.
