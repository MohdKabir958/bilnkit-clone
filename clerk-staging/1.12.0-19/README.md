# Grozo 1.12.0+19 — connected Android staging builds

All three apps use the deployed HTTPS API and Socket.io origin: `https://grozo-backend-3wdf.onrender.com`. They include the single-store grocery marketplace, cash-delivery workflow, nearby rider offers and updated welcome pages. Admin onboarding is server/admin code, not a separate phone login shortcut.

| App | APK |
| --- | --- |
| Customer | [Download](Grozo-Customer-Clerk-Test.apk) |
| Vendor | [Download](Grozo-Vendor-Clerk-Test.apk) |
| Delivery partner | [Download](Grozo-Delivery-Clerk-Test.apk) |

Android 7.0+ (API24), ARM64, profile mode, development signing. Package IDs remain `in.grozo.customer`, `in.grozo.vendor`, `in.grozo.driver`. VersionCode2019 updates prior matching-signed previews. Verify `SHA256SUMS` and `manifest.json` for source commit, configuration and exact hashes. No server credentials are included.

Open the APK link in your phone browser, download the file, then open it and allow installation from that browser if Android requests it. These are durable Git files, not expiring chat artifacts. If a GitHub file page opens, choose Download raw file. Do not use historical APK links for this workflow.

Clerk uses the owner's current development instance; hosted login and physical-device behavior require owner checks. Vendor/rider accounts require explicit Grozo approval and configured service areas. No fake catalog or authentication bypass is embedded. Data comes from the backend. Enable cash only for an operationally configured city; online payments require owned Razorpay TEST configuration. Firebase is disabled in these staging builds because owned client configuration is unavailable; source FCM integration remains intact. Free Render instances may sleep and uploads are ephemeral.
