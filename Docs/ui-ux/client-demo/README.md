> Latest customer home matches the supplied visual reference. See [customer UI handover](../../customer-reference-ui/README.md), [actual render](../../customer-reference-ui/screenshots/home-390.png) and its updated APK evidence.

# Grozo current client demo gallery

Updated 26 October 2026. Open `index.html` for implemented screens and `Grozo-before-after.pdf` for the regenerated comparison. The original theme is preserved. The latest captures include grocery imagery, single-store checkout, cash-order handling, three role-specific welcome pages and four-step admin vendor/rider onboarding.

Flutter captures render actual production widgets with explicit service/native-channel fixtures. React captures use actual components with labelled synthetic API fixtures. None are physical-device, hosted Clerk-session, live-payment or street-routing verification. The login recovery screenshot shows the actual implemented provider-unavailable state; it does not claim hosted sign-in succeeded here.

See `../../marketplace-workflow/handover.md`, `../../flutter-start-pages/handover.md` and `../../admin-partner-onboarding/handover.md` for changes and operator steps. Product imagery is original AI-generated, unbranded demonstration imagery; rights/provenance are documented in `../../demo/product-image-licenses.md`. All demonstration businesses and accounts are explicitly synthetic.

The latest matched Android staging APKs, exact checksums and download-verification evidence are listed in `../../production-readiness/10_FINAL_HANDOVER.md`. Historical artifact directories remain available. They target the Render HTTPS backend and use native Clerk development authentication. These are development-signed ARM64/API24+ builds, with Firebase disabled pending owned Android configuration. Device installation, hosted authentication, owned FCM and Razorpay TEST checks remain external verification steps. Free Render can sleep and does not persist uploads.

The fixture browser harness is test-only and is never imported by the production entry point. No fake login or embedded dummy catalog was added to the APKs. Existing seeded backend data and the selected delivery address determine what a signed-in phone sees.


## 26 October readiness capture update

The latest gallery includes real Flutter renders of customer item approval, vendor packing/opening hours and performance/stock alerts, plus Chromium captures of the current admin inventory, access, finance and job-health/seller-expiry interfaces. Checkout shows a qualified server estimate. Source/API data is explicitly synthetic. The admin login image is the actual Clerk network-recovery state, not evidence of a hosted sign-in. Some legacy login components are rendered directly for compatibility review and do not represent the configured Clerk entry flow. Physical-device captures have not been made.
