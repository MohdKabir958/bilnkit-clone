# Development setup

Use the existing isolated checkout. Do not create an extra worktree. Node 24.19.0/npm 11.9.0 were used; the lockfiles, not the old README badges, determine actual package versions. Flutter 3.44.9 is the selected SDK, compatible with the app locks' Flutter >=3.44/Dart >=3.12 requirement.

1. Install PostgreSQL 16+ or start `docker compose up -d postgres`. Compose publishes only loopback and uses trust auth for a disposable local volume. It is not a production database configuration.
2. `node scripts/init_dev_env.mjs` creates `backend/.env` once with unique local authentication secrets and disabled payments. Supply `DATABASE_URL` to that command if the database user/path differs. An existing `.env` is never overwritten. Inspect the file locally for admin login; never paste values into chat or commit it.
3. In backend: `npm ci`, `npx prisma generate`, `npm run db:deploy`, `npm run build`, then `npm run dev`. This uses the real database. Payments are unavailable until real Razorpay sandbox settings replace disabled mode. Google login and push require configured projects.
4. In each web folder: `npm ci`, `npm run build`, `npm run dev`. Admin port is 3000; landing defaults to 5173. `web/super_admin/.env.example` documents API/socket overrides.
5. Flutter: export `PUB_CACHE=/workspace/.pub-cache`, `XDG_CONFIG_HOME=/workspace/.config`, `XDG_CACHE_HOME=/workspace/.cache`, `ANALYZER_STATE_LOCATION_OVERRIDE=/workspace/.dartServer` on this cloud machine; add `/workspace/.tools/flutter/bin` to PATH. In each app run `flutter pub get --enforce-lockfile`, `flutter analyze`, `flutter test`, and `flutter build bundle --debug --target-platform=linux-x64`. Use an emulator/device for platform features; Android APKs need Android SDK and valid app-specific Firebase configuration.
6. Test with a separate empty `market_test` database, `DATABASE_URL=.../market_test npm run db:deploy`, then set that URL explicitly when running backend `npm test`. Never point destructive tests at the development or production database.

Brand changes: edit `branding/brand.json`, run `python3 scripts/configure_brand.py`, then rebuild clients. App names/IDs, shared palette, native labels/icons/splash, API service name and admin identity are centralized. Firebase package IDs, Maps restrictions, release signing and store listings must match the new app IDs; the upstream project's client config must not be treated as your production project.

## Configuring delivery geography

Run `npm run db:deploy` after pulling additive migrations. In the admin Coverage tab, create and enable a city, create its delivery circle and delivery fees, confirm a store’s city/PIN/coordinates/hours, then explicitly enable its zone coverage. Moving a store disables its previous coverage. Customers save structured addresses, using manual coordinates or a single foreground GPS fix; selecting another address reloads nearby stores. No default city or campus point grants serviceability.

Optional maps use backend `MAPS_GEOCODER_URL` (HTTPS Photon-compatible search), `MAPS_ROUTER_URL` (HTTPS OSRM-compatible routes) and optional server-only `MAPS_PROVIDER_TOKEN`. Without configured providers, manual address/GPS entry continues working and map adapters return an explicit unavailable result. Production admin tiles require `VITE_MAP_TILE_URL` and `VITE_MAP_ATTRIBUTION`; configure an owned/licensed provider. Local debug APK checks can use `ORG_GRADLE_PROJECT_disableFirebase=true`; this flag is rejected for release. Normal builds require matching owned Firebase client configuration for the generated application IDs.

## Grocery operations

Admin manages categories in Categories and store accounts in Vendors/Applications. Vendor **Menu → Products and inventory** creates SKUs and variants, edits pack/MRP/images/tax/availability, adjusts counted stock and reads recent stock movements. Each variant is a separate SKU using the same product group. New products and vendor metadata edits require admin approval; stock changes do not await moderation. Admin **Products and inventory** filters by city/store/name/SKU/low stock, edits product metadata, approves products and applies audited stock adjustments. Existing Catalog provides rejection, archive/restore and commission review controls.

Prices entered in the grocery form are the tax-inclusive selling price; configured vendor/global commission determines vendor proceeds in integer paise. Plain moderation preserves the requested selling price. Explicit admin repricing remains available; checkout refuses any price above MRP. Tax metadata must be checked by the operator; this implementation is not a tax-compliance certification.

Customers see nearby serviceable stores, paged catalogs beyond the first 50 products, product packs/variants, exact MRP savings and available quantities. Each store’s items form an independent order. The inherited optional split-checkout capability remains server-controlled: eligible stores must serve the same saved address and reservations commit together.

Mobile endpoints now use `--dart-define=API_BASE_URL=https://your-owned-api.example/api` and optional `--dart-define=SOCKET_URL=https://your-owned-api.example`. Debug defaults to the Android emulator’s local backend. Release getters reject non-HTTPS configuration. No mobile build defaults to the upstream operator’s backend.
