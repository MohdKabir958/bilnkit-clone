# Isolated staging and rollback

Nothing here authorizes a production deployment. No personal operator account may be used for tests, invitations, bootstrap or account changes. Use separately approved synthetic identities and consenting test mailboxes only.

## Establish matching source first

Record Render's actual service branch and Git commit from its deployment details/API, and Vercel's actual Git commit/branch from deployment metadata. Compare both with the reviewed feature/production-readiness commit. A Live/Ready badge, frontend HTML or health response does not prove a Git SHA. The old observed Render feature/india-grocery-platform/0727cb value is operator-reported historical evidence, not a current verified deployment. Do not switch the existing service branch or production domain automatically.

After explicit staging approval, provision an isolated Neon branch/database and separate staging Render/Vercel targets from the same reviewed commit. Runtime DATABASE_URL uses the Neon pooled TLS connection; MIGRATION_DATABASE_URL uses its direct TLS connection for controlled deploys. Confirm the two URLs identify the intended staging database. Never reset/drop/seed the existing production database. Apply the additive RiderInvitation and order-reporting index migrations using the maintained migration scripts. Back up/record migration status first. Paid Render Starter/disk or provider resources require approval and current quoted costs before creation; free Render has no durable upload disk or pre-deploy command. Do not silently use it as a production substitute.

Backend Clerk publishable/secret/webhook keys, issuer and exact authorized parties must belong to the staging instance. Configure exact staging ADMIN_URL/CORS. Keep Razorpay webhooks separate; use the existing disabled or real test-provider staging mode according to supported runtime policy, without fabricated provider credentials or production financial calls. Keep FCM source intact; owned Firebase configuration and device-token ownership checks require explicit test configuration.

Admin VITE_AUTH_MODE, VITE_CLERK_PUBLISHABLE_KEY, VITE_API_BASE_URL and VITE_SOCKET_URL must match that staging backend and Clerk instance. Generate exact trusted Clerk/API/WebSocket CSP origins through the maintained configuration tool. Add only the exact authorized tile host if using VITE_MAP_TILE_URL; provider secrets stay server-side in MAPS_PROVIDER_TOKEN. Backend MAPS_GEOCODER_URL requires an authorized Photon-compatible HTTPS service. No map provider or paid infrastructure was created by this change.

## Acceptance, with evidence from that commit

Use synthetic approved administrator/vendor/rider identities, isolated data and no personal account. Record deployment SHAs, non-secret database identity, request/response code, role, expected/actual and screenshots for each case:

- Zero and populated Overview, city/IST date filters, keyboard/chart drills to filtered server-paginated orders, correct captured/platform cash/outstanding figures.
- Compact directory server totals/filters/pages, lazy details/payouts, denied and successful acknowledged open/close, current-city approvals.
- Inline category creation and duplicate handling, retained store input, approved primary-category public visibility and refreshed Customer filtering/icons.
- Confirmed inside/boundary pickup and circle preview; outside/wrong-city/disabled/stale zone refusal; closed draft without zone. Moving pickup blocks active orders and requires coverage review.
- Vendor app creates/edits/receives stock/lots only for its approved owned store; Admin moderates; Customer discovers the result. A second vendor is denied. Assistance requires valid matching store/operator context and retains version/idempotency checks.
- New rider intended-account Clerk verification and expiring/revoked/one-time invitation; 409 before Review; genuine 429/Retry-After; explicit admin review and OFFLINE start; assigned area, duty and offer eligibility in Delivery.
- Synthetic COD order through Customer → owned Vendor packing → first eligible accepting rider → pickup → delivery verification → Admin cash evidence/reconciliation. Test provider online callbacks separately with real test credentials; no live money.
- Real-device FCM ownership/isolation, GPS, Clerk refresh/account-switch/logout, navigation and callbacks. Fixture screenshots/unit mocks cannot satisfy these provider/device gates.

## Rollback

Before rollout record backend/admin prior SHAs, environment keys by name (never secret values), schema migration state and storage backup. Roll back applications together to a compatible reviewed pair if acceptance fails; retain additive tables/indexes and historical/financial rows. Do not undo migrations destructively or switch authentication modes as an emergency shortcut. Keep stores closed if pickup/coverage needs review. Document all failures and request approval before changing the existing hosted service, domain, credentials or database.

## Current delivery status (27 October 2026)

Source implementation is on feature/production-readiness, not merged into a production branch or deployed. Three 1.16.1+25 Android previews are published on the existing artifact branch; their compiled API/socket point to the supplied Render origin. Each public APK was downloaded again, returned HTTP 200 and matched its recorded SHA-256. This establishes distribution integrity, not compatibility with an unverified hosted backend SHA. Android versionCode is 2025 (ARM64 split ABI), development signing, API 24+. Firebase is not configured in these previews.

The attached 13-screen gallery/15-page PDF is real local Chromium rendering with explicitly synthetic API fixtures. It cannot replace the staging acceptance above. Current source tests, CI links, checksums and external blockers are in 08_VERIFICATION.md and 10_HANDOVER.md. No personal account was used. No existing hosted branch, domain, authentication mode, database or financial records were changed.
