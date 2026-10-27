# Grozo admin workflow fixes

Baseline: `dec347b0ad073bc608f45f395560126f8340480e`. Target: `feature/production-readiness`. Latest branch fetched and fast-forward checked; no newer work discarded. Work is sequential, without agents. Existing design, identities, financial protections and historical records remain. The exact request is retained in REQUEST.md.

| Task | Scope | Status | Source/tests/commit |
| --- | --- | --- | --- |
| 5 | Pickup-aware zone validation | Source implemented including map preview in Task 4; UI tests pass | pickupCoverage.ts, CreateStoreDrawer, adminStores.ts; 20 UI tests passed; database recheck blocked by declined sandbox network permission |
| 6 | Rider eligibility, invitation and 409/429 handling | Source implemented; 14 focused UI tests pass; full backend verification blocked | riderOnboarding service/routes, additive RiderInvitation migration, CreateRiderDrawer, RiderInvitations, RiderInvitePage, ApiRetryAfter; see 06_RIDER_INVITATIONS.md |
| 1 | Authorized dashboard aggregates and interactive charts | Source implemented; 7 UI + 16 backend unit tests pass; SQL integration pending | overview.ts, OverviewDashboard, OverviewOrders; city/date server filters, IST calendar ranges, real money definitions |
| 2 | Compact vendor directory and details | Source implemented; 3 focused UI tests pass; SQL integration pending | vendorDirectory.ts authorized paginated totals; VendorManager compact cards and 10 lazy tabs; vendor_directory.test.ts |
| 3 | Inline categories and Customer visibility | Source implemented; 11 focused UI tests pass; Flutter runner / PostgreSQL blocked | CategoryForm/CreateStoreDrawer; primary-category counts/cache/rename/merge; Customer matching retains product categories |
| 4 | Places provider and confirmed map pin | Source implemented; 29 focused UI tests pass; provider/device acceptance pending | PickupLocationPicker/PickupPinMap, MAP_SEARCH rate limit, confirmed pickup route and audit/coverage review guards |
| 7 | Vendor-owned catalog and audited admin oversight | Source implemented; 13 focused UI tests pass; new read-only assertion/full regression pending | InventoryPanel oversight, catalogAssistance store/operator/TTL audit, vendor stock/hours contracts retained |
| 8 | Full regression, actual staging acceptance and screenshots | Pending | In progress |

Deployment SHAs must be independently checked; a live badge is insufficient. No existing hosted service, database, auth mode or paid resource will be changed without explicit approval. Real Clerk/provider/device acceptance is separate from isolated HTTP/browser fixtures.
