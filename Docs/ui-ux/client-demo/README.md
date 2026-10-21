# Grozo client demo

Updated 21 October 2026. The implemented screens are ready for visual review; see [final verification](../../qa/final-app-verification.md) and [isolated scenario setup](../../demo/README.md). Open [the gallery](index.html) or [the four-page before/after PDF](Grozo-before-after.pdf). The four `*-before-after.png` contact sheets are easy to share. All images link back to actual renderer/browser captures under `../before` and `../after`.

## What the evidence demonstrates

- Customer: product-led discovery, categories, actual pack/price/MRP/stock presentation, product details, cart, checkout and tracking. Loading, empty and offline states are also captured.
- Vendor: store availability, paid-order queue, grocery inventory, product form, filters and stock-related actions, earnings.
- Delivery: duty, private offers with server deadlines, active delivery, customer-code verification and earnings.
- Admin: light operations overview, stores, inventory and edit drawer, orders, delivery partners, finance and coverage using the actual local API/pilot catalog.

Flutter images use production widgets with isolated service fixtures. Their sample products, names, addresses and amounts are test data, not evidence of live customers or sales. Product illustrations are original AI-generated unbranded assets, documented in the [rights inventory](../../demo/product-image-licenses.md). Admin data comes from persisted local records. No physical-device or live-payment claim is made.

## Suggested walkthrough

1. Compare Customer Home before/after. Inspect packs, store ownership, valid MRP savings, unavailable stock, visible category/search controls and persistent navigation labels.
2. Open product details, cart and checkout. Explain that the cart bar is items subtotal, while the existing server quote confirms checkout fees and the payable total.
3. Show customer loading/empty/offline images and retry wording.
4. Show Vendor inventory and product form, then the queue: earned amounts, preparation/ready actions and delivery-partner status. Counts marked “loaded” do not pretend to cover unrequested pages.
5. Show Delivery duty/offer and active-delivery screens. A countdown appears only for a supplied server deadline; expired claims are locally disabled. Customer contact/verification data stays server-authorized.
6. Demonstrate the local Admin overview, inventory filters, edit drawer keyboard focus and coverage. Open the drawer for review, then cancel; do not alter operational records just to produce a demo.

## Running the current local admin

Use [the setup guide](../../06_setup_guide.md). The isolated demo backend runs at `127.0.0.1:5001`; its admin dev server runs at `localhost:3001`. The previous pilot remains separate. Sign in with the locally configured passcode from ignored `backend/.env` without sharing it. This workspace is not a public deployment. If the services stop, run `npm run dev` in backend and admin with the existing environment settings. Do not run backend tests against this development database.

## Android handover

The previous redesign's three debug builds verified compilation on 20 October; they were not rebuilt in this polish pass. Smaller development-signed ARM64 profile APKs are published on the [Android artifact branch](https://github.com/MohdKabir958/bilnkit-clone/tree/artifacts/grozo-android-preview), with direct downloads, hashes and package/signature metadata.

Those APKs support startup/sign-in screen inspection on compatible Android phones. They retain the emulator API address and have no owned Firebase/OAuth project configured. They do not provide connected phone login, ordering, payments or notifications. Use the gallery/PDF to review screens that require an authenticated service session. A connected phone build needs the real deployed HTTPS backend and owned client configuration; [the deployment guide](../../11_hosted_deployment_and_apk_handover.md) explains the settings.

## Remaining verification

Review [visual QA](../07_visual_qa.md), [verification results](../verification-results.json) and [remaining issues](../08_remaining_issues.md). Hosting, owned provider configuration, production signing and physical-device end-to-end testing are separate from this implemented UI review. No live payments were attempted.
