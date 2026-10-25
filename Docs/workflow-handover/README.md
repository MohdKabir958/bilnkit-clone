# Grozo workflow, welcome pages and onboarding handover

Completed 25 October 2026, preserving the existing Grozo theme and architecture. These three tasks were implemented sequentially on separate branches. No production database reset, live payment operation, new paid resource or authentication shortcut was introduced.

| Task | Branch | Reviewable implementation commits |
| --- | --- | --- |
| Single-store grocery marketplace | feature/india-grocery-platform | 4ca97e9, 2430911; verification 3962337 |
| Three Flutter welcome pages | feature/flutter-start-pages | edd8b70, 337f0cf |
| Admin vendor/rider onboarding | feature/admin-partner-onboarding | aba7afb |

The final `main` and `feature/india-grocery-platform` integrate all three tasks. The Flutter branch remains available for separate review. Documentation/evidence commits follow the implementation; obtain the final SHA from the branch head. `changed-files.txt` lists all changes since the prior pushed baseline 2938a79.

## What changed

Customers can discover serviceable nearby stores, search shops/store categories/product names across the backend catalog, inspect public store details and buy from one store per new order. Pricing, coupons and stock remain server-controlled. Online orders reach the vendor after verified payment. Cash orders reach the vendor immediately; payment is recorded only when the assigned rider confirms cash with the valid customer delivery code. Existing historical multi-store orders retain compatibility.

Vendors can switch between their approved owned stores, manage selected-store stock/profile/location and process their own orders. After store acceptance, the backend broadcasts offers to eligible nearby riders. The first acceptance wins under locks. Fresh GPS, city/zone coverage, approval and duty status control eligibility; pickup/drop verification and cash receipts remain protected. Finance has separate cash handover/refund records, without fabricated gateway transactions.

All three apps now start with a role-specific welcome page using the existing light customer/vendor and dark rider themes. Native Clerk still owns sign-in, recovery, account creation and sessions. Signed-in Continue rechecks Grozo business access; partner approval remains separate from login.

The admin portal now guides vendor creation through Store → Pickup → Access → Review and rider creation through Identity → Vehicle → Area → Review. Back preserves input. Final review controls creation; explicit rider approval starts unchecked. Verified provider identity and Grozo UUID linkage, server role checks, suspended-account restrictions and service-area validation prevent account takeover or self-approval. Stores start closed; riders start offline. Completion links lead directly to the next operational page, with inventory preselected for the new store.

## Updated Android APKs

Version **1.12.0+19**, ARM64, Android 7.0/API24+, development-signed profile builds. All three use API and Socket.io origin **https://grozo-backend-3wdf.onrender.com** and the owner's current native Clerk development instance.

- [Customer APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/1592365/clerk-staging/1.12.0-19/Grozo-Customer-Clerk-Test.apk)
- [Vendor APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/1592365/clerk-staging/1.12.0-19/Grozo-Vendor-Clerk-Test.apk)
- [Delivery APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/1592365/clerk-staging/1.12.0-19/Grozo-Delivery-Clerk-Test.apk)

These are durable Git files. Every public download returned HTTP200 with the exact built byte count and SHA-256 hash. Build/version/package/callback/signature/compiled-URL evidence and source-tree equality are in [Android evidence](../flutter-start-pages/evidence/android/). No Clerk Secret Key pattern was found. Original application IDs are preserved. Download in the phone browser, open the APK and allow that browser to install it if Android asks. A matching-signed prior preview can be updated; do not uninstall unnecessarily because uninstalling clears local data.

Firebase is disabled in these staging APKs because owned Android Firebase client configuration is unavailable. Source FCM integration remains in place. APK compilation and fixtures do not prove physical-device installation, hosted Clerk/Google login, outdoor GPS, push delivery or a real Razorpay TEST transaction. Those remain owner/device verification steps. Render Free can sleep and does not preserve upload files. These are personal-device staging builds, not production-signed Play Store releases.

## Verification

| Component | Actual final result |
| --- | --- |
| Backend | 1138 passed, 0 failed, 0 skipped, 47 suites, one invocation, 413.641 seconds, exit0 |
| Admin | 853 passed, 0 failed, 0 skipped, 55 files; production build passed |
| Customer Flutter | 463 passed, 2 optional rendering skips; analysis clean |
| Vendor Flutter | 530 passed, 1 optional rendering skip; analysis clean |
| Delivery Flutter | 413 passed, 1 optional rendering skip; analysis clean |
| Shared Flutter UI | 22 passed; analysis clean |
| Enabled Flutter screenshot harnesses | All three passed separately |
| Android | All three compiled and passed APK integrity/configuration checks |
| Browser onboarding captures | 14 actual implemented screens, no overflow/uncaught errors reported |
| Static guards | Terminology + three guard tests, auth inventory and whitespace checks passed |

[Full backend report/log](../qa/final-backend-regression.md), [onboarding verification](../admin-partner-onboarding/verification.md), [Flutter machine-readable summary](../flutter-start-pages/evidence/summary.json). Initial failed runs are preserved and explained separately; their counts are never added to a final full-run result. The final backend uses a fresh isolated local PostgreSQL database; Neon was not modified for tests.

## Deploy and demonstrate

1. Deploy the final branch head to the existing Render service and Vercel admin (`web/super_admin`), or let configured Git auto-deploy do so. No new onboarding secret is required. Use the existing safe hosted migration/start command; never reset Neon. The additive marketplace migration is required.
2. In admin create/enable store categories, city and delivery zones. Use confirmed merchant pickup coordinates. Follow Vendors → Add vendor, then add products/stock, link the eligible verified owner, check coverage/hours and open the store. Demo businesses must remain clearly synthetic.
3. Use Delivery partners → Add rider, or review existing applications in Approvals. Choose a valid service area and approve only after checks. Riders sign in to the delivery app and go on duty with real GPS.
4. Install the new customer APK and select a genuinely serviceable delivery address/map pin. The backend's existing catalog/seeded data determines what appears; these APKs do not contain a dummy catalog.
5. Enable cash only in an operationally configured city. Test order → vendor acceptance → first rider acceptance → pickup → valid-code doorstep completion. For online payment use owned Razorpay TEST configuration; a payment-disabled backend cannot charge or complete an online checkout.

Detailed operator guides: [marketplace](../marketplace-workflow/handover.md), [welcome pages](../flutter-start-pages/handover.md), [vendor/rider onboarding](../admin-partner-onboarding/handover.md).

## Actual screenshots

[Current screenshot gallery](../ui-ux/client-demo/index.html) · [updated comparison PDF](../ui-ux/client-demo/Grozo-before-after.pdf) · [all onboarding steps](../admin-partner-onboarding/screenshots/) · [Flutter welcome pages](../ui-ux/start-pages/).

Flutter captures render production widgets with explicit native/service fixtures; React captures use actual components with labelled synthetic API fixtures. They are not physical-device or hosted-session evidence. No fake screenshots were generated. Existing unbranded demo product imagery has its rights/provenance inventory in [product-image-licenses.md](../demo/product-image-licenses.md).
