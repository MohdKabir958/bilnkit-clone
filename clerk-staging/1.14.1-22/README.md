# Grozo Delivery 1.14.1+22

[Download delivery APK](Grozo-Delivery-Clerk-Test.apk) · [Integrity checks](manifest.json) · [Checksums](SHA256SUMS)

Fixes the Clerk welcome-screen access loop. New riders proceed to registration, submit name/contact/vehicle details, wait for administrator approval, receive an approved service area and go on duty. Existing approvals, suspension, order ownership and GPS/dispatch rules stay enforced.

Deploy backend source **be665d1** or later before using this APK; it needs `/api/partner/driver/onboarding`. No new schema migration, secret, database reset or paid resource is needed.

API and Socket.io: https://grozo-backend-3wdf.onrender.com. Native Clerk development instance: capable-mutt-6.clerk.accounts.dev. Package **in.grozo.driver**, ARM64/API24+ profile build, versionCode **2022**. Same development signing certificate as previous previews; not a Play Store release. Clean application build source: be665d1a71b91bc32c5935ee4108740db9bc1eba.

ZIP integrity, Android signature, callback declarations, ARM64 ABI, compiled Render URL and absence of Clerk Secret Key patterns verified. Physical installation, real hosted Clerk login, live GPS and offer handling require an operator/device check. Owned Firebase client configuration remains missing, so FCM is disabled only in this staging APK; notification source is preserved.

Open the download on your phone and install as an update. This file does not expire like chat artifacts. Customer 1.13.0+20 and vendor 1.14.0+21 downloads remain in their existing version folders.
