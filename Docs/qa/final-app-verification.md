# Final application verification — 21 October 2026

The complete backend result is [1,064 passed in one invocation](final-backend-regression.md). This document covers the four interfaces after the final-polish changes.

| Component | Command / outcome |
| --- | --- |
| Customer Flutter | `flutter test --concurrency=2 --reporter=expanded`: 457 passed, 0 failed; 2 opt-in capture tests skipped in the ordinary run |
| Vendor Flutter | Same command: 527 passed, 0 failed; 1 opt-in capture skipped |
| Delivery Flutter | Same command: 407 passed, 0 failed; 1 opt-in capture skipped |
| Shared Flutter UI | `flutter test --reporter=expanded`: 8 passed, 0 failed |
| Flutter analysis | `flutter analyze` in all three apps and `packages/kraveo_ui`: no issues found |
| Admin | `npm test -- --reporter=json`: 807 passed, 0 failed, 0 skipped |
| Admin build | `npm run build`: TypeScript and Vite production build passed |
| Backend build | `npm run build`: TypeScript passed |
| Terminology | `python3 scripts/qa/check_ui_terminology.py`: passed; reviewed exact internal/historical allowances, including shared Flutter UI |
| Guard tests | `python3 scripts/qa/test_terminology_guard.py`: 3 passed |

Machine-readable counts: [app-verification.json](app-verification.json). Full mobile test/analysis outputs are the `*-flutter-tests.txt` and `*-flutter-analysis.txt` files here. Admin per-test results are in [admin-tests.json](admin-tests.json), build output in [admin-build.txt](admin-build.txt). SDK versions are in [flutter-environment.json](flutter-environment.json).

## Customer and financial compatibility

The incomplete coins widget, checkout/cart section, profile balance promotion, review reward promotion and completion prompt were removed from the visible UI. Cart provider/model/API balance fields and review crediting remain intact. Tests confirm no coins UI, unchanged totals when a stored balance changes, existing coupon application, server quotes, checkout/order totals, Razorpay retries/idempotency, tracking and customer/address isolation. No payment arithmetic or gateway verification was changed.

Customer captures show actual decoded grocery images, product listing/details, a cart without coins, selected synthetic delivery address, checkout and tracking. Checkout receives a fixture snapshot obtained from the existing quote service on the demo records (₹77 items / ₹103.01 server total). The capture does not prove Google authentication or a paid phone session.

## Vendor, delivery and admin

Vendor tests cover the existing dashboard, inventory, forms, image picker/upload contract, order queue, location and payouts. The screenshot inventory uses scenario packs/prices/stock; low-stock layout tests deliberately use a separate controlled low-stock example. Backend demo tests verify real authenticated vendor image upload and unauthenticated rejection.

Delivery tests cover duty/offers, arrival/pickup, customer verification, completion, navigation fallbacks and active orders. Two added navigation tests use the exact scenario coordinates and service radius. The capture's GPS fix is explicitly simulated at the published pickup anchor, avoiding a misleading distance from an inherited different-city fixture. Pickup and in-transit screens are captured separately.

Admin tests cover store/inventory/coverage/order/assignment/finance tools. Real Chromium captures use the isolated local demo API, including product photos. The inventory capture waits for visible product images to decode. Responsive and keyboard observations are in `../ui-ux/after/admin/capture-results.json`.

## Screenshot provenance

- Flutter: actual production widgets, isolated scenario/API/GPS fixtures, bundled fonts and the same image bytes installed by the seed. Engine image decoding and fade completion are awaited before capture. A customer assertion requires decoded product image frames.
- Admin: actual Chromium connected to the local database/API; no fake activity/revenue was inserted.
- Product image assets: original AI-generated generic illustrations, not externally sourced merchant photographs. See [image rights](../demo/product-image-licenses.md).
- No physical-device capture, live payment, live FCM delivery or external street-route verification is claimed.

Capture commands from each app directory:

```sh
flutter test test/ui_visual_capture_test.dart --dart-define=GROZO_CAPTURE=true --reporter=expanded
# Customer loading / empty / offline captures are separate:
flutter test test/ui_state_visual_capture_test.dart --dart-define=GROZO_CAPTURE=true
```

Browser and gallery commands from the root, with the configured local demo services running:

```sh
GROZO_ADMIN_ORIGIN=http://localhost:3001 GROZO_API_ORIGIN=http://127.0.0.1:5001 \
  GROZO_REQUIRE_PRODUCT_IMAGES=1 node scripts/ui_ux/capture_admin.mjs
python3 scripts/ui_ux/build_demo_gallery.py
python3 scripts/ui_ux/build_demo_contact_sheet.py
```

## Remaining limits

Published map anchors are historical source facts, not an on-site GPS/entrance survey or premises authorization. The store/customer labels are explicitly simulated. Real routing, maps-provider operation, Google OAuth, FCM delivery, gallery permissions, Android installation/outdoor visibility/GPS battery and Razorpay TEST end-to-end flows need owned configuration and/or physical devices. Authentication and provider integrations remain enabled in source; the local demo has no owned OAuth/FCM setup and uses existing disabled-payment development settings.

The admin retains the existing large-main-chunk build warning (about 1.09 MB minified). No production deployment, native APK rebuild, live payment or physical-device check was performed in this polish pass. Earlier APK artifacts remain snapshots of the previous redesign; use the updated gallery/PDF for this review.
