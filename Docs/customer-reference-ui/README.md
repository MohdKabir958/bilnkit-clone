# Customer home — supplied Grozo visual reference

Branch: `feature/customer-reference-ui`. Customer version: **1.13.0+20**.

The supplied image is the visual target for the existing customer application's home screen. This changes the customer presentation; the backend, Clerk bridge, payment verification, order processing and vendor/rider authorization remain in place.

## Visual implementation

- Compact green gradient header, white leaf/wordmark, “Freshness Delivered”, wishlist and a real cart-count badge.
- Pale-green address row with location pin and selector; rounded white search field.
- Nearby Stores first: horizontal compact white cards, store illustration, actual open/closed state and backend-provided distance. The nearest open store with a known distance receives the “Best Choice” badge; no rating or distance is invented.
- Shop by Category: the ten reference departments in a five-column/two-row illustrated grid at normal phone text size. Large text gets fewer columns and taller cards.
- Popular Products: two white cards per row, product photos, actual price/MRP/saving, pack size, source store, working product hearts and outlined ADD/quantity controls.
- Compact Home / Track / Orders / Me navigation. The header cart opens the existing cart. The old large greeting/hero, home chip strip and floating cart summary no longer alter the reference layout. Active-order tracking remains available. The legitimate first-order coupon remains below the catalog and in the existing cart flow.

Data remains live. Actual store names, addresses, product ordering, photos, stock and prices can differ from the reference's demonstration content. The app does not embed the four screenshot stores, substitute invented inventory or paint a static screenshot over the UI. Device status time/battery are supplied by Android, not a fake Flutter status bar.

## Working interactions

The address selector retains structured saved-address/serviceability behavior. Search retains server-backed shop/product discovery and pagination. Store taps open the existing store details/catalog. Nearby Stores → View All retains managed store-category filtering and store favourites. Product departments group backend product categories; when managed category IDs are available, product requests use the existing protected category/pagination API. New category-page products are remembered for the existing cart's SKU validation. Failed category requests can be retried.

Product hearts and header favourites use real state within the signed-in session, separate from store favourites, and clear on logout/account reset. The category directory, product listing and saved-product screens use implemented Flutter widgets. ADD still checks availability/stock and asks before replacing another store's cart. Prices, discounts, coupons, payment and final checkout totals remain backend-controlled.

## Screenshots and verification

Screenshots in `screenshots/` and `../ui-ux/customer-reference/customer/` render the actual production widgets with explicit synthetic catalog/native-channel fixtures. They are not physical-device or hosted-login captures. The 630px preview uses the supplied image's phone-content aspect ratio; it is a rendering, not a generated UI mockup. The original screenshot includes surrounding image margins and Android system chrome that are outside the app's Flutter layout.

The new category artwork is an original, unbranded generated asset, documented in `artwork.md`. It is a single local atlas with no external image dependency and no new product-photo duplication in the APK. Existing demo product images retain their recorded provenance.

Test evidence, build metadata and direct APK download verification are saved in `evidence/`. Initial failed runs are retained and explained in `verification.md`; no functional test is disabled to accommodate this redesign.

## Download the updated customer app

[Customer APK — 1.13.0+20](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/e84d57c036a14a8ef52c0ff8f764410fbcb6655e/clerk-staging/1.13.0-20/Grozo-Customer-Clerk-Test.apk) · [Actual rendered home](screenshots/home-390.png) · [Reference-aspect preview](screenshots/home-630.png).

The APK targets `https://grozo-backend-3wdf.onrender.com`, retains `in.grozo.customer`, and uses the same development certificate as prior previews. It is an ARM64 / Android7+ profile staging build. Open the direct link in your Android browser and install the downloaded APK; these links do not depend on temporary chat artifacts. Vendor/delivery apps remain their existing 1.12.0+19 builds.
