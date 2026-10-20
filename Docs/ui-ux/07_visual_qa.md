# Visual QA and verification

Verified on 2026-10-20. Baseline: `e1afe6e`. Evidence inventory: [screenshot-manifest.json](screenshot-manifest.json). Machine-readable outcomes: [verification-results.json](verification-results.json).

## Evidence and scope

There are 28 before captures and 52 final captures. Customer, vendor and delivery images render the actual production Flutter widgets with bundled fonts and explicitly isolated API/socket/location fixtures. They are not physical-device or live-checkout screenshots. Admin images are actual Chromium captures connected to the local backend and persisted pilot catalog. Zero activity stays zero; no sample revenue or activity was inserted into the admin UI. No live payment or dispatch was performed.

`client-demo/index.html` browses the final captures. `client-demo/Grozo-before-after.pdf` and four contact-sheet PNGs compose existing captures; no UI was reconstructed for the comparison. Flutter baseline debug ribbons were a capture-harness setting; final ribbons are disabled. Missing product photos use the implemented package fallback. Hindi uses the bundled, licensed Noto fallback.

## Layout and accessibility checks

| Surface | Checks | Outcome |
| --- | --- | --- |
| Customer grocery grid / labelled navigation | 320, 360, 390, 430 px; text 1×, 1.3×, 2× | 12 layout cases passed; controls exercised; no Flutter overflow |
| Vendor inventory | Same four widths; text 1× and 2× | Eight cases passed, including scrolling to and activating Low stock |
| Delivery duty / offers | Same four widths; text 1× and 2× | Eight cases passed; server confirmation still controls duty state |
| Existing app flows | Existing small-phone and enlarged-text regression tests | Passed; cart, grouped checkout, queue, OTP and navigation retained |
| Admin representative destinations | Overview, inventory, stores, orders, delivery partners, finance, coverage at 1024/1280/1440/1920 | No document horizontal overflow in 28 observations |
| Admin enlarged text | Inventory at 1024 px with 200% root text size | No document overflow after header/grid fixes |
| Keyboard | Shared Flutter pressable Enter/Space; admin inventory drawer initial focus, wrap, Escape, focus restoration | Passed |
| Shared accessibility roles | Light/dark body, secondary, quiet and action text pairs; reduced motion; enlarged button labels | AA text contrast checks and reduced-motion tests passed |

The browser observations are saved in `after/admin/capture-results.json`. These are targeted checks, not a complete accessibility certification or a physical-device performance measurement.

## Defects found and corrected

- Stable navigation labels and widths replaced shifting, selected-only labels.
- Product actions share stock/closed-store checks and preserve cart confirmations.
- Long labels enlarge buttons instead of being forced into fixed heights. Vendor system scaling is no longer capped.
- The vendor payout reminder moved inside the earnings scroll view after enlarged-text overflow was reproduced.
- Inventory remains lazy and paginated; debounced searches retain request/version guards. Late customer catalog responses from the previous address are discarded.
- Legacy widget keys and machine-interpreted cancellation/OTP strings remain compatible. Historical names, coupon IDs, enum values and API query field names were restored/preserved during terminology review.
- Admin 200% text exposed header minimum-content width and an implicit inventory-grid column. Header controls now wrap; the grid uses a bounded column and wrapping card content.
- Delivery offer cards size to their content when given bounded space. Countdown uses only a supplied server deadline and disables expired local claims.
- Controlled customer loading, empty and offline captures verify actual production state widgets, including retry.

## Regression results

| Component | Final result |
| --- | --- |
| Customer | Full suite: 457 passed, 0 failed; capture harness skipped in ordinary run |
| Vendor | Full suite: 527 passed, 0 failed; capture harness skipped in ordinary run |
| Delivery | Full suite: 404 passed, 0 failed; additional unique expiry test passed; final offer/capture subset passed after content-sizing correction |
| Shared Flutter UI | 8 passed, 0 failed |
| Admin | 807 passed, 0 failed |
| Backend | 1,058 passed across 42 suites using latest result per suite: full run, failed-suite reruns, final corrected category-query test rerun |

The backend figure is an aggregate of verified suite results; it is not a claim that the last full backend command was all green. Test wording/data contract mismatches were corrected without disabling tests. The existing concurrent cart-deletion case now explicitly accepts the typed `409 CART_CHANGED` outcome and keeps its immutable snapshot assertions. Backend logic was not changed to fit that assertion.

Commands used:

```sh
# In each apps/{customer,vendor,driver}_app
flutter test --concurrency=2 --reporter=expanded
flutter analyze

# In packages/kraveo_ui
flutter test --reporter=expanded
flutter analyze

# In web/super_admin
npm test -- --reporter=json
npm run build

# Backend: an isolated migrated test database, never production/development data
NODE_ENV=test DATABASE_URL='<isolated-test-db>' npm test -- --json
npm run build

# Opt-in real-widget captures, per mobile app
flutter test test/ui_visual_capture_test.dart test/grocery_redesign_test.dart \
  --dart-define=GROZO_CAPTURE=true --reporter=expanded
# Customer loading / empty / offline evidence
flutter test test/ui_state_visual_capture_test.dart --dart-define=GROZO_CAPTURE=true

# Root: running local backend + admin required; credentials read only from ignored .env
node scripts/ui_ux/capture_admin.mjs
python3 scripts/ui_ux/build_demo_contact_sheet.py
```

All three apps and `kraveo_ui` finish analysis with **no issues found**. Opt-in renderer tests passed separately. Source FCM, payment, location, authentication and socket workflows remain integrated; isolated tests do not prove external-provider delivery.

## Builds

Admin `tsc && vite build` and backend `tsc` pass. Vite reports the existing large-main-chunk warning (approximately 1.09 MB minified / 306 KB gzip); map code remains lazy loaded. No startup or frame-rate improvement is claimed without measurement.

All three Android ARM64 debug APKs compile with development signing. Command, per app:

```sh
ORG_GRADLE_PROJECT_disableFirebase=true flutter build apk --debug \
  --split-per-abi --target-platform android-arm64 --no-pub
```

This explicit local-build flag bypasses owned Firebase project wiring; FCM is still present in source and enabled by default for configured builds. Release signing/configuration guards remain in place. Smaller development-signed profile builds are published for direct GitHub downloads: Customer 48.1 MB, Vendor 46.1 MB and Delivery 45.7 MB. All three debug and all three profile APKs passed ZIP, package-ID and Android-signature verification. The three published URLs returned HTTP 206 for a four-byte range, with the expected APK prefix and exact total file lengths. Exact hashes and metadata are in `android-preview-manifest.json`, `android-debug-builds.json` and `android-download-verification.json`. This does not establish connected phone workflows.

Physical Android installation, outdoor contrast, TalkBack traversal, real GPS/battery behaviour, frame timing, OAuth, FCM delivery and gateway TEST end-to-end checks remain unverified here. See [08_remaining_issues.md](08_remaining_issues.md).

UI-only profile compilation used the same local Firebase bypass and `flutter build apk --profile --split-per-abi --target-platform android-arm64 --no-pub`. No release build, production signing or hosted deployment is claimed.
