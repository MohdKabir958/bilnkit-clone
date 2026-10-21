# Isolated Grozo client demonstration

This is a **synthetic marketplace simulation** in configurable Bengaluru. The two stores, accounts, unit numbers, products and stock are fictional. Public mapped points are navigation anchors; no fictional merchant is claimed to operate at those premises and no authorization to conduct a real pickup is implied. Riders are approved in the isolated database and start OFFLINE. Do not send a real courier, customer message or payment for the simulation.

## Location provenance

[scenario.json](../../demo/scenario.json) contains the exact coordinates, record names, pinned source URLs and map links for three published Bengaluru public transport points: Krishnarajendra Market, Shivajinagar Bus Station and Town Hall. Coordinate facts are taken unchanged from the published Open Bangalore/BMTC-derived `geohacker/bmtc` GeoJSON snapshot. No random offsets or invented GPS pins are used. Only three point facts are recorded; the original dataset/collection is not redistributed and its README does not state a dataset licence. Source attribution is retained; no unsupported licence is asserted.

The two simulated stores use the market-area and Shivajinagar anchors. Synthetic customer units use Town Hall and Shivajinagar anchors. Labels explicitly say simulation, rather than impersonating a merchant or resident. PINs have Indian six-digit form, country IN, and the same configured city. These are demonstration addresses, not verified private residences.

The source is historical published map data, not a current on-site survey or verified loading entrance. Live Nominatim/OpenStreetMap/Wikipedia endpoints are blocked in this environment. The pinned source is accessible and coordinates are verifiable from its records; current physical access, safe loading access and premises authorization require owner verification before any real operation. External street routing is unconfigured; do not claim a road route was field-tested. Existing Google/geo/browser navigation links use the supplied coordinates, and provider-adapter tests exercise those same pins.

## Dataset and safeguards

- Two approved, explicitly simulated grocery stores; 24 SKUs across dairy, produce, staples, bakery, snacks, beverages, cooking and household categories.
- Two customers with structured delivery addresses; two approved offline riders assigned to the demo city/zone.
- One configurable 8 km service circle; every store/customer pair passes the real `deliveryEligibility` rules after initialization.
- Exact paise prices, pack sizes, MRP, available/out-of-stock state and initial stock movement records. Images install automatically from the checked-in assets; see [rights inventory](product-image-licenses.md).
- Local `grozo_*_demo` database required, `NODE_ENV=development DEMO_SEED=1`, empty migrated data required. The seed refuses production/remote databases, existing data and existing credential files. No passwords are logged or committed; private credentials use mode 0600 under ignored `backend/var/`.
- Existing pilot, production, historical orders, coins records, payments and account ownership are never rewritten. Legacy offset/campus seeds and unsafe account-reset/linking helpers now fail with a pointer to this seed.

## Reproduce

Install the existing dependencies and build backend (`npm ci`, `npx prisma generate`, `npm run build`). Create a dedicated empty UTF-8 local database named `grozo_client_demo_demo` (for example, `CREATE DATABASE grozo_client_demo_demo ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';`) and set `DATABASE_URL` securely, then:

```sh
cd backend
npm run db:deploy
NODE_ENV=development DEMO_SEED=1 PUBLIC_BASE_URL=http://127.0.0.1:5001 \
  UPLOAD_DIR=./var/client-demo/uploads npm run seed:demo
```

The default credential output is `backend/var/demo-credentials.json` (private). Set `DEMO_CREDENTIAL_FILE` for another private destination. `DEMO_SCENARIO_FILE` can select another reviewed JSON scenario with documented source coordinates; validation rejects unsupported pins or store/address pairs outside the zone. An alternative city needs its own sourced location facts and PINs; changing a city name alone does not geocode an address.

For this cloud workspace, `node scripts/qa/prepare_demo.mjs` creates a fresh local demo database, migrates it and initializes the images/catalog. It derives local connection settings from ignored `backend/.env` without printing them. Private runtime settings are written under `backend/var/client-demo/`; start `backend/dist/index.js` with that environment. Use port 5001 for the demo API and port 3001 for the admin with `VITE_API_BASE_URL=http://127.0.0.1:5001 VITE_SOCKET_URL=http://127.0.0.1:5001`. No public hosting is provisioned by this setup.

Vendor/rider credentials work through real password authentication. Synthetic customer `.invalid` emails do not provide Google accounts: actual customer phone login requires owned OAuth and a real consenting test account. No login bypass is included. Payment and FCM integrations remain in source; this local server uses existing disabled-payment/unconfigured-Firebase settings. Configure owned TEST provider credentials separately for connected end-to-end demonstration. Never enable live payments for this dataset.

## Verification

`backend/test/e2e/client_demo.test.ts` exercises source-coordinate validation, all-pair discovery, real partner login/wrong-password rejection, local image serving and authenticated vendor upload, server pricing/stock, rider zone eligibility and routing-adapter request pins. Routing transport in that test is explicitly simulated; it is not live street routing. Existing lifecycle/payment/dispatch/OTP/security suites remain active. Latest complete regression evidence is in [final-backend-regression.md](../qa/final-backend-regression.md).

The customer capture uses `demo/capture-quote.json`, a quote snapshot obtained by calling the existing quote service against the isolated demo records. Its subtotal is ₹77 and server-derived total ₹103.01 for the two pictured products/address. The rendering harness supplies that snapshot as a controlled service response; it does not establish Google login or a paid customer session.
