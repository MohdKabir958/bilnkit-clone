# Grozo Customer 1.13.0+20 — reference home UI

[Download customer APK](Grozo-Customer-Clerk-Test.apk) · [Actual Flutter UI preview](customer-home-preview.png) · [Integrity/provenance](manifest.json) · [SHA-256](SHA256SUMS)

This version implements the supplied customer home reference: green Grozo header, address/search, nearby store cards, ten illustrated departments, two-column products, favourites, ADD controls and compact navigation. The preview uses explicit synthetic catalog fixtures; the APK does not embed those stores/products or an authentication bypass. Actual data comes from the backend.

API / Socket.io origin: `https://grozo-backend-3wdf.onrender.com`. Android package `in.grozo.customer`, ARM64, API24/Android7+, profile mode, development signing, split versionCode2020. Native Clerk uses the owner's current development instance. No backend secret is included. Vendor and delivery builds remain version1.12.0+19 in the previous version folder.

Open the download link in the phone browser, save the .apk and install it. Allow installation from that browser if Android requests it. Matching-signed earlier previews can update without uninstalling. This is a durable Git file rather than an expiring chat artifact.

Owned Firebase client configuration remains unavailable, so push is disabled in this staging APK. Physical-device installation and hosted Clerk/Google login are not claimed as verified here. These are personal-device staging builds, not production-signed Play Store releases. Render Free can sleep. Checkout/payment behavior and the existing backend's authorization remain unchanged.
