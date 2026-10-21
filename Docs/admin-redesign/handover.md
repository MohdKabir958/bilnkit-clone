# Grozo admin workspace

This update adds email-based team permissions and makes the existing admin portal easier to operate. It uses the existing Clerk, PostgreSQL, Express and React applications. No hosted database was changed from this workspace.

## First deployment

1. Deploy the updated backend branch on Render. Keep Docker Command **`npm run start:render`**. It applies the additive `20261021150000_admin_access` migration before starting the API. This works on the free plan without a paid pre-deploy command. Do not reset or overwrite the database.
2. Keep the existing, explicitly provisioned first administrator in `CLERK_ADMIN_USER_IDS`. That administrator must already have the database ADMIN role, as established during your first bootstrap. Their next verified request creates an Owner grant. This step is only for the first owner or reviewed recovery.
3. Deploy the updated `main` admin build on Vercel, Root Directory **`web/super_admin`**, using the existing `VITE_AUTH_MODE`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, `VITE_SOCKET_URL` values. Keep the exact backend-approved origin `https://grozo-admin.vercel.app` without a trailing slash. No new frontend secrets are required.
4. Sign out and sign in again. Open the pinned **Team & access** page. Your role should be Owner. If the team endpoint returns 404 or a missing-table error, deploy the latest backend and migration first.
5. Check Vendors, Cities & zones and Orders against your intended database. A successful local test is not proof that a hosted deployment or your personal device has been verified.

## Add an administrator — no IDs or database editing

1. As an Owner, open **Team & access → Add administrator**.
2. Enter the person's email address. Choose **Administrator** for normal marketplace work or **Owner** if they should also manage team permissions.
3. Select **Grant access to email** and share `https://grozo-admin.vercel.app` with them. The UI does not send an email automatically.
4. They sign in or create an account through Clerk and verify that same email. Grozo checks the verified email directly with Clerk and activates the pending grant.
5. To change a role, use the person's role selector. To remove access, select **Remove access** and confirm. The final active Owner cannot be removed or demoted; another Owner must first sign in and activate their access.

Future additions require no Render environment changes, SQL or redeployment. A pending Owner invitation does not count as an active Owner. Administrator permissions include finance and other existing sensitive marketplace operations, so grant them only to trusted operators. Use separate admin and vendor/rider identities.

| Role | Marketplace operations | Team permissions |
| --- | --- | --- |
| Owner | Full existing administrative operations | Add, change and remove team access |
| Administrator | Vendors, inventory, orders, cities, riders, support and finance | No team directory or role changes |
| Other signed-in account | Its own existing customer/partner permissions | No admin access |

An email grant never claims another historical Grozo account with a matching email. Once activated, the grant binds to its exact Clerk subject and existing internal UUID. Profile metadata and request-body roles cannot grant privileges. Revocation is enforced in REST authorization and private Socket.io revalidation. Team changes are audited. Account deletion clears directory email/name and revokes access while retaining audit/identity tombstones. Removing a bootstrap ID from environment variables does not revoke an existing database grant; use the portal.

## Add and manage vendors

- Open **Vendors** to see all stores in the selected workspace city. Use All/Open/Closed and search to narrow the list.
- Select **Add vendor**, choose an enabled city and enter the store name, pickup address, locality, PIN and confirmed latitude/longitude. Use a merchant-confirmed pickup pin; do not invent coordinates.
- Optionally choose a delivery zone containing that pickup. The server checks the zone's city and radius.
- Optional owner email must belong to an eligible account that has already signed in to Grozo and verified that email through Clerk. No password is generated. An existing partner application should be reviewed in **Approvals**, where its approval/suspension history remains visible.
- Leave owner blank for an administrator-managed catalog store. This does not give an arbitrary partner access to the store. Assigning ownership to an already-created unowned store is not part of this update; use a reviewed operator linkage or provide the owner when creating it.
- New stores are approved by the administrator but **closed**. Add products/stock, finish coverage and review pickup/opening hours before opening the store with its availability switch.
- Existing vendor profile, map-pin, commission and payout controls remain available. Financial operations retain their existing authorization and confirmation rules.

## Add products and stock

Open **Products & stock → Add product**. Select the store and an enabled product category, enter a unique SKU, product group, pack quantity/unit and selling price. Add an owned/licensed photo using the existing upload control or approved HTTPS URL. New products start with zero stock. Select **Adjust stock**, enter the counted received packs and a reason. The existing server handles stock versions, reservations and idempotency. Prices remain integer paise and server validated.

For Render Free, local uploaded files are ephemeral across deploys/restarts. Use durable owned HTTPS object-storage image URLs for a stable catalog, or the existing paid disk baseline only after explicit cost approval. This update creates no paid resources.

## Manage cities and city-wise ordering

The **Workspace city** selector scopes vendor lists, order queries, inventory, overview metrics and relevant rider/map views. All cities shows the network. Team, finance, customer, approval and platform-settings pages clearly identify that they apply across the platform. This is an operational filter, not a city-specific staff permission boundary.

Open **Cities & zones** and follow the steps:

1. **Cities:** create a city code/name/state and enable or pause configured cities.
2. **Delivery zones:** create/edit the geographic radius and delivery fees. Fees use exact paise; PIN alone never grants serviceability.
3. **Store locations:** set the confirmed pickup and opening hours. Changing a location disables old coverage, so reassign it next.
4. **Store coverage:** explicitly connect a store to the correct zone and optional delivery radius.
5. **Rider areas:** assign idle approved riders to enabled zones. Active deliveries retain existing ownership/state rules.

Select the city, open **Orders** and review its real server-filtered order page. Pagination retains that city. City setup changes do not silently expand every store's delivery coverage. Review operational readiness before enabling ordering.

## Login and verification limits

The login, loading, denied-access and recovery screens share the new Grozo layout. The form itself remains the official Clerk React component with matching colors; there is no custom password collection or bypass. See [screenshots](screenshots/README.md) and [verification](verification.md).

Captures use real implemented React components in Chromium with explicit local API fixtures. They are not hosted sessions or device captures. This workspace's proxy blocks the hosted Clerk/Render/Vercel endpoints. The login capture therefore shows the implemented provider-failure recovery state; it does not prove hosted sign-in. Verify the Clerk form, Google/email flow, API connection and team activation on your deployed URLs after rollout.

No Flutter source changed in this update, and no new APK is required for this admin redesign. Existing FCM, Razorpay, finance encryption, inventory and delivery integrations remain in the architecture and are covered by the backend regression rather than live provider transactions.
