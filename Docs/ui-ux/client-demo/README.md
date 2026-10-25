# Grozo current client demo gallery

Updated 25 October 2026. Open `index.html` for implemented screens and `Grozo-before-after.pdf` for the regenerated comparison. The original theme is preserved. The latest captures include grocery imagery, single-store checkout, cash-order handling, three role-specific welcome pages and four-step admin vendor/rider onboarding.

Flutter captures render actual production widgets with explicit service/native-channel fixtures. React captures use actual components with labelled synthetic API fixtures. None are physical-device, hosted Clerk-session, live-payment or street-routing verification. The login recovery screenshot shows the actual implemented provider-unavailable state; it does not claim hosted sign-in succeeded here.

See `../../marketplace-workflow/handover.md`, `../../flutter-start-pages/handover.md` and `../../admin-partner-onboarding/handover.md` for changes and operator steps. Product imagery is original AI-generated, unbranded demonstration imagery; rights/provenance are documented in `../../demo/product-image-licenses.md`. All demonstration businesses and accounts are explicitly synthetic.

Connected Android 1.12.0+19 staging APKs are available in `artifacts/grozo-android-preview/clerk-staging/1.12.0-19` on GitHub, with SHA-256 checksums and compiled-source metadata. They target the Render HTTPS backend and use native Clerk development authentication. These are development-signed ARM64/API24+ builds, with Firebase disabled pending owned Android configuration. Device installation, hosted authentication, owned FCM and Razorpay TEST checks remain external verification steps. Free Render can sleep and does not persist uploads.

The fixture browser harness is test-only and is never imported by the production entry point. No fake login or embedded dummy catalog was added to the APKs. Existing seeded backend data and the selected delivery address determine what a signed-in phone sees.
