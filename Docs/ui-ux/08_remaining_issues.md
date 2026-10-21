# Remaining verification and release limitations

Updated 21 October 2026; see `../qa/final-app-verification.md`. Targeted layout and functional regressions pass; the following limits remain.

- Flutter screenshots are production widgets rendered with isolated fixtures, not physical Android screenshots or live end-to-end checkout evidence. No Android emulator/KVM is available here. Physical-phone accessibility, outdoor visibility, GPS/battery usage and frame timing need device testing.
- Backend tests use the local payment simulator and test database. Owned Razorpay/Google/Firebase/maps configuration and live provider verification are separate prerequisites; no live payment was attempted.
- Product/store photos are shown only when supplied. Missing imagery deliberately uses a clear placeholder. No competitor photography is included. The synthetic demo now has twelve original AI-generated unbranded product illustrations; their provenance and applicable rights are recorded in `../demo/product-image-licenses.md`.
- Customer product pages now load on demand and search is debounced with bounded concurrency. The serviceable store list is still fully fetched. Global searches make one request per serviceable store, so a very large coverage area needs a consolidated server search endpoint. Search-discovered SKUs remain cached for checkout/reorder until the address/catalog refreshes; memory and frame timing need physical-device measurement.
- Historical customer/store/product names and addresses may contain older terminology. They are user data and are not rewritten. Internal class/package/API/Prisma names, coupon identifiers, status enums and legacy machine-interpreted cancellation/error strings remain compatible.
- The environment cannot access the benchmark homepages (HTTP403); no live competitor research is claimed.
- Hosted deployment, production signing and physical-device testing are not established by a UI build. Debug APKs use development configuration and signing.

- The admin production build still reports a main JavaScript chunk of approximately 1.09 MB minified / 306 KB gzip. Map code is lazy loaded; further route splitting and real loading-time measurements remain a performance follow-up.
- Published phone APKs are development-signed ARM64 profile previews. They retain the emulator API address and use an explicit local Firebase wiring bypass. They support startup/sign-in inspection, not connected phone authentication or orders. Source FCM remains intact and configured builds enable it by default. No authentication bypass or fake production catalog was added.
- Render/Neon/Vercel deployment tools are not exposed in the current environment. No hosted resource was created during this redesign. The prepared deployment guide and exact admin root (`web/super_admin`) remain available.
