# GROZO — Admin UX, Partner Onboarding, Catalog Ownership & Real-Environment Bug Fixes

## Codex assignment

Repository: `MohdKabir958/bilnkit-clone`
Target implementation branch: `feature/production-readiness` (create a task branch if needed).
Last reviewed handover: `dec347b0ad073bc608f45f395560126f8340480e`.
Previously verified application source: `477d86743fb1accffffcc7ee99c5d4f1a7802821`.

**Implement these changes end to end in source, with focused unit/integration/browser tests, while preserving the Grozo design, Clerk authorization, existing data and financial protections. Do not stop at analysis or mocks.** First fetch the latest HEAD and retain all newer work. Plan/track each task separately. Never change production infrastructure, credentials, database, or real money without explicit owner approval. Use an isolated staging environment and synthetic data for real browser API acceptance.

### Key operator evidence

- Admin URL: `https://grozo-admin.vercel.app/`
- Backend URL: `https://grozo-backend-3wdf.onrender.com/`
- Render service has been observed configured to track `feature/india-grocery-platform` and serving old commit `0727cbdecf25a2f5f0b1af9052ee8ce340c042e3`; the new source was on `feature/production-readiness`. Re-read hosting state before deployment; do not assume old data is current.
- Screenshots show tall two-column vendor cards, oversized Open for Orders switch, nearly empty overview, manual coordinate input, static category picker, active product management from Admin, and confusing rider onboarding.
- `POST /api/v1/admin/stores` / Add Vendor returned HTTP 400 `ZONE_MISMATCH`, field `zoneId`: "Choose an enabled zone in this city that contains the store pickup location." In current `backend/src/routes/adminStores.ts`, this validates city + zone active + Haversine radius. The wizard in `web/super_admin/src/components/CreateStoreDrawer.tsx` lists every enabled zone in selected city but does not filter zones by actual pickup coordinates, causing late rejection.
- `POST /api/v1/admin/riders` returned **HTTP 409 Conflict**, not HTTP 429, with `PARTNER_ACCOUNT_REQUIRED`, field `email`: "Ask this partner to create a Clerk account and verify this email before assignment." The handler calls `verifiedPartnerIdentity`. A separate actual 429, if observed, must be diagnosed with its own request/response and Retry-After, not conflated with this 409.
- Existing source supports custom admin categories (`CategoriesPanel`, `CategoryForm`, `POST /api/admin/categories`) and Customer home categories (`GET /api/categories?for=home` in `DhabaProvider`), but category creation isn't inline in Add Vendor.
- Vendor primarily owns inventory through the Vendor app, but Admin `InventoryPanel.tsx` exposes regular create/edit/adjust stock actions for all stores.
- Existing `AnalyticsPanel.tsx` uses `recharts`, with area/bar visualizations. Reuse its design/library; do not introduce a redundant chart dependency.

## TASK 1 — Useful interactive Overview dashboard

Redesign Admin Overview so that, without scrolling through mostly empty shortcut cards, it shows key operational facts. Use the existing responsive typography and Grozo green palette.

Top: city selector, date range (Today, 7d, 30d, 90d), last-refresh state; 4–8 compact KPI tiles such as orders, collected/captured GMV (define exactly, don't mix COD uncollected with settled money), delivered orders, pending orders, open/approved stores, riders on duty, pending approvals, urgent exceptions.

Below: interactive area/line chart for orders and money over time; donut chart for current order statuses; horizontal bar chart for top vendors; donut chart for COD vs online; rider status breakdown and actionable needs-attention items. Clicking a slice/bar/tile must navigate or filter the corresponding Orders/Vendors/Finance/Delivery view, preserving city/range filters. Tooltips should explain metric definitions and distinguish pending cash from received cash.

Use real authorized backend aggregation, server-side filters, bounded queries and indexes as needed. Never generate demo figures for a connected Admin. Zero orders must display zero and a sensible empty-state, not invented revenue. Ensure responsive desktop/tablet/mobile, keyboard accessibility, chart legends and accessible textual summaries. Avoid legacy hostel/campus wording; generalize to localities/zones if such breakdown remains.

## TASK 2 — Compact Vendor directory and details drawer

Refactor `VendorManager.tsx`: cards should be substantially shorter and dense. Show store avatar/name, primary category, approved state, open/closed indicator, city/locality, product count, current order count and one affordance to view details. Use compact 2–4 column grid depending on viewport or a responsive list/table. Add search, city/status/category filters; support pagination with server-backed totals. Avoid loading full payout data for all cards.

Click card -> Vendor Details drawer/page with tabs: Overview, Products, Orders, Inventory, Location & Coverage, Working Hours, Compliance, Commission, Payouts, Audit. Existing vendor-owned data stays scoped. Move location editor, commission, payout details and all secondary operations off the list card.

Replace the huge "Open for orders" toggle with an accessible compact status chip and small `Open/Close` control in the details view. Confirm closing when appropriate; display backend refusal or blockers; use optimistic update only with rollback on failure. Never equate manually open with valid city/zone/owner/stock eligibility. Preserve existing audit and authorization protections.

## TASK 3 — Inline custom category creation and Customer visibility

In Add Vendor's Primary Store Category picker offer searchable options and `+ Create category`. Open a compact inline form/drawer using the **existing** category service. Choose name, icon, purpose (store/product/both), active and `Show on Customer Home`. Save then auto-select category without losing other wizard fields. Prevent duplicates/invalid names and show safe errors. Admin-only creation; do not allow arbitrary public writes.

Confirm enabled, active, home-visible categories are returned through existing public `GET /api/categories?for=home` and appear in Customer app after refresh when they have eligible store/product usage; update client/category mapping if needed. Validate icon fallbacks, sorting, filters and empty states. Keep store primary category separate from product categories and fix vague "No categories yet" copy when a primary category already exists.

## TASK 4 — Replace raw latitude/longitude with map search and verified pin

Use an authorized provider abstraction for places/autocomplete/geocoding and a map with draggable/confirmable pin in `CreateStoreDrawer` and vendor location editor. Admin enters name/address/locality/PIN, searches suggested places, selects exact pickup point, reviews formatted address, adjusts pin on map and confirms. The backend still stores accurate numeric lat/lng and source metadata. Never infer valid coordinates from PIN alone or commit a default/simulation landmark as a real store. Apply vendor map-pin update audit and re-review rules.

Evaluate provider licensing/prices; use existing supported map tooling if viable. External keys must be injected safely; no secrets in Vite browser bundle (public browser keys need restrictions). If provider is absent, give a clear optional manual-pick/copy-coordinate fallback rather than silently inventing a position. Preserve safety for users with inaccurate address search results.

## TASK 5 — Fix `ZONE_MISMATCH` before submit

The zone picker must be filtered by: selected active city, active zone, actual pickup point within the zone's configured geometry (current Haversine circle). After selecting/dragging the pin, show matching zones and preview selected coverage radius visibly on map. If no zone contains pickup, show `No eligible delivery zone covers this store`, link to configure coverage, and allow `Create as closed draft / assign later` with zoneId omitted. Keep shop closed/unserviceable until proper owner/coverage/stock approvals and explicitly opened. Don't weaken the backend check. Avoid showing 'Created' if API 400.

Client and backend must have consistent validation; backend remains authoritative under concurrent zone changes. Provide validation during pickup/coverage steps and preserve form inputs after failed POST. Tests for center, boundary, outside radius, wrong city, inactive zone, no zone, stale zone, arbitrary coordinates and new draft. Confirm the screenshot's example is not incorrectly using a simulated map anchor.

## TASK 6 — Rider invitation and `PARTNER_ACCOUNT_REQUIRED` UX

Separate `Invite rider` (new) and `Review applications` (existing). The current button `View existing applications` is for avoiding duplicate rider profiles and should move to the Delivery Partners list/toolbar with clearer text. Do not remove the existing Applications functionality.

Before finishing the Add Rider form, perform a secure, rate-limited identity eligibility check (do not leak arbitrary account existence to unauthorized users). If identity isn't verified, tell Admin **before final Review**; offer a safe invitation workflow. Ideally create a pending invite with TTL and one-time redemption, using Clerk-supported invitation/verification flows and consent. If provider credentials or mail delivery are missing, implement only the secure invite record/UI/fallback with clearly stated pending external configuration; do not falsely say an invitation was sent.

Once verified, permit admin linking under existing Clerk identity lock. Never create passwords, fake users, self-approve or repurpose a customer with order history. Existing applicants route to Applications instead of duplicate creation. Admin can optionally approve only after genuine identity/vehicle checks; rider always starts OFFLINE. Show proper inline `email` error for 409. Handle **actual HTTP 429** distinctly with a wait/retry message honoring Retry-After; don't blindly retry POST and don't disable anti-abuse rules.

## TASK 7 — Vendor-owned product workflow and Admin oversight

Vendor mobile app must be the primary day-to-day interface for creating/editing products, setting pricing, adjusting inventory, managing lots/batches/expiry and opening hours for **only their approved stores**. Check the existing implementation, repair any broken cross-app contract. Admin retains visibility across vendors to moderate products, manage fraud/compliance, inspect low-stock exceptions and perform clearly audited interventions. Rename/reorganize Admin `Products & stock` to a `Catalog Oversight` information architecture where standard staff actions are review/approve/reject/inspect; move bulk everyday vendor stock administration behind explicitly authorized exceptional controls, not as the primary CTA. Do not remove admin emergency controls or block legitimate onboarding assistance. Preserve store ownership, role checks, stock audit, server price, refunds and concurrency safety.

## TASK 8 — End-to-end validation against actual staging, not just fixtures

First verify actual deployed Render Git SHA/branch and actual Vercel Git SHA/branch. Do not assume that a green Live badge proves latest source. If the deployments are old, prepare a non-destructive isolated staging rollout with proper Neon staging database and migrations. Get explicit approval before changing an existing live backend, auth mode, domain, or database. Preserve current hosted data and offer rollback.

Run existing full suites (backend, admin, all Flutter apps, build/analysis) and add focused regression tests for each change. Also execute automated browser-to-staging tests against the **same commit** and **real backend** with synthetic approved identities/data:
- Overview loads real aggregates; date/city filters and chart clicks work; zero-state is accurate.
- Add Store with confirmed pin within zone succeeds; outside-zone surfaces actionable error; closed draft without zone succeeds; other-city/inactive zone is rejected.
- Create/choose custom category; verify category assigned to store, returned from public endpoint, and shown/filterable in Customer app.
- Compact vendor directory -> click -> details; open/close controls reflect backend and permissions.
- Vendor logs into mobile, adds product, stocks it, Admin approves/moderates, Customer can discover it; a different vendor cannot mutate it.
- Rider invitation/verified account -> Admin linking/approval -> assigned city zone -> Delivery app duty/offers. Unverified identity gives helpful 409, actual 429 handled separately.
- Cross-app synthetic COD checkout -> vendor accepts/packs -> rider pickup/delivery OTP -> Admin financial reconciliation.
- Assert idempotency and business permissions; never bypass validation to pass tests.

Use screenshots, request/response captures with private values redacted, live deployment commit, test user roles, database identity, expected/actual, pass/fail, and direct evidence. No fabricated live-service success. Add mobile physical-device steps separately as pending if no device is attached. Update unit/widget/Playwright browser tests and CI. Track tests on the exact app/build commit.

## Deliverables and completion gate

1. Separate reviewable commits per task, complete integration commit and a task table with source paths/tests/SHA.
2. Updated responsive screenshots for dashboard, compact vendor grid/details, category creation, map pin and zone coverage, rider invite/errors, catalog oversight.
3. Automated tests and actual staging API/browser test evidence for the 400 zone mismatch and 409 identity conflict; explain root cause and guardrails for 429.
4. Updated deployment instructions for matching backend/Admin commits, staging database migrations and rollback; no production change without permission.
5. Accurate list of external credentials/approvals/blockers (maps provider, Clerk invites, FCM, device/provider tests) without pretending these are complete.
6. Final test counts, direct GitHub CI links and working design state.

**Start by recording current deployed SHAs and reproducing the reported errors. Prioritize TASK 5 and TASK 6 correctness; then implement TASK 1–4 and TASK 7, followed by integrated TASK 8. Complete source work without stopping at a report.**
