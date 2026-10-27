# Grozo Android previews — 1.16.1+25

Built from mobile source at 8668d448a29ad3f60b3b2a521eee8b4913ac9afc on feature/production-readiness. Later backend test/documentation changes do not modify mobile source.

- [Customer APK](Grozo-Customer-Clerk-Test.apk?raw=true) — SHA-256 `690f90649f763df706c978c3d77c8bbf7928e452d599cb9314d0e25bfdade52f`
- [Vendor APK](Grozo-Vendor-Clerk-Test.apk?raw=true) — SHA-256 `0a980d2e733fa959720de629c57b338071be6457b7fc89c051e1300e6d4f8685`
- [Driver APK](Grozo-Delivery-Clerk-Test.apk?raw=true) — SHA-256 `87161693929c1124ce7baf2e17404b782cafc91692c3d7d1a8ba073072858fba`

ARM64, Android API 24+, profile builds, development signed. Flutter build number 25; Android split-ABI versionCode 2025. Signatures and compiled API URL verified. Source analysis/tests/bundles pass for all three apps in CI run 40452042359.

REST: https://grozo-backend-3wdf.onrender.com/api
Socket.io: https://grozo-backend-3wdf.onrender.com
Clerk development application: capable-mutt-6. No secret key is shipped.

These point to the supplied hosted backend; its current source/deployment was not changed or verified to match this branch. New server features need an explicitly approved matching deployment. No hosted Clerk sign-in, physical-device, GPS, payment or FCM acceptance claim. Firebase push configuration is absent in these previews; FCM source remains intact. Do not use these as Play Store production releases. No personal account was used.
