# Add demo products to the existing staging database

The hosted Neon database was **not modified from this workspace**: only a local database connection is available. The exact SQL below was verified in a fresh migrated local PostgreSQL database. It creates no login accounts and does not grant roles.

1. Open Neon → your Grozo staging project → **SQL Editor**. Select the same branch/database used by Render's DATABASE_URL. Do not select a database containing live production commerce.
2. Open [seed-hosted-catalog.sql](seed-hosted-catalog.sql), copy the entire file, paste into the SQL Editor and click **Run**.
3. The result should list **Grozo Demo Market One · Simulated** and **Grozo Demo Market Two · Simulated**, each with **12 products**.
4. Reopen or refresh the existing backend-configured customer APK. No new APK is required. It fetches stores/products from the API. The admin website can show these rows after administrator provisioning.

The dataset covers Bengaluru, Karnataka: a simulated 8 km central-city zone, two published public map anchors, eight grocery categories and 24 product packs. Eleven products per store start in stock; tomatoes deliberately show sold out. Prices are in rupees with integer paise MRP values. Initial positive stock movements are recorded. Public ratings start at zero. Seeded products use a zero flat commission override without changing global pricing settings.

Products include milk, bananas, flour, eggs, rice, bread, oil, biscuits, tea, oranges, cleaner and tomatoes. Images are the project's original unbranded AI demo illustrations, pinned to an immutable GitHub source commit; all 12 image downloads were checksum-verified. See [image rights](product-image-licenses.md). The admin CSP allows exactly `https://raw.githubusercontent.com` for images. It does not grant that host script/API permissions.

The SQL runs atomically, uses a distinct `gzhostdemo-blr` namespace and serializes repeats. It inserts missing rows; reruns do not reset existing stock, approval status, opening status or product edits. Conflicting ownership/IDs fail the transaction. Users, Clerk identities, passwords, account balances, orders and payment records remain untouched. Stores are deliberately unowned; a random vendor sign-up must not gain access. A verified operator must associate an approved vendor with a store separately before its vendor app can manage those items. No rider assignment or delivery history is fabricated.

Customer browsing uses the real public discovery/store-detail routes. For serviceability/checkout tests, save an explicitly simulated Bengaluru delivery address at one of the published scenario points, e.g. Town Hall `12.96393155, 77.58425661`, PIN `560002`, label “Demo address · Simulated”. Do not enter that as a real home address or arrange a physical delivery. The real backend accepted all four existing scenario address/store combinations in local verification. Payments remain disabled on this staging service, so a real paid order cannot be completed.

Local evidence: [9 PostgreSQL/API checks](../qa/hosted-demo-catalog/local-verification.json) and [12 image checks](../qa/hosted-demo-catalog/image-verification.json). This is not evidence that Neon was seeded. Verification of hosted insertion is the SQL result and the deployed API response after the operator runs it.

Regenerate SQL without contacting a database: `python3 scripts/demo/generate_hosted_catalog.py`. The existing `npm run seed:demo` remains a separate local-only full scenario tool and is not changed to permit production access.
