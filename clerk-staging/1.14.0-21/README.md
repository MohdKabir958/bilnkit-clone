# Grozo Vendor 1.14.0+21

[Download vendor APK](Grozo-Vendor-Clerk-Test.apk) · [Checksums](SHA256SUMS) · [Build verification](manifest.json)

Fixes Clerk store registration: the required business phone is visible, store categories come from Grozo, new owners enter setup, and applicants see approval status. After approval, use Products and inventory → Add product, receive stock, obtain product approval, and open the store.

**Deploy backend source c5d8636 or a descendant before using this APK.** The new app needs the authenticated `/api/partner/vendor/onboarding` route. No new secret or database reset is needed.

API and Socket.io: https://grozo-backend-3wdf.onrender.com. Native Clerk development instance: capable-mutt-6.clerk.accounts.dev. Package: in.grozo.vendor. ARM64/API24+ profile build, versionCode 2021, same development certificate as earlier previews. Build source: c5d8636c02deedbd67cc1fb7fe0411cc0db8eff8 with clean application source.

APK ZIP, signature, package, callbacks, compiled Render URL and absence of Clerk secret-key patterns verified. Physical-device/provider checks remain pending. Owned Firebase configuration is unavailable, so push is disabled only in this staging APK; FCM source is preserved. This is a personal test build, not a Play Store release.

Open the download on your Android phone and install it as an update. These direct files do not expire like chat artifacts. The existing customer 1.13.0+20 and delivery 1.12.0+19 builds remain available in their version folders.
