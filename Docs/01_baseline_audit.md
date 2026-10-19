# Baseline audit — implementation branch

This audit describes inspected source and local evidence, not the upstream README's production-readiness score. The working fork is `MohdKabir958/bilnkit-clone`; upstream copyright is preserved. Work is on `feature/india-grocery-platform`.

| Capability | Existing implementation / source | Status and required work |
|---|---|---|
| Central API and database | `backend/src/index.ts`, `db.ts`, `prisma/schema.prisma` | Express/Prisma/PostgreSQL implemented. Fresh historical migrations fail before creating tables; new empty-schema bootstrap fixes local provisioning without editing old migrations. |
| Admin authentication | `backend/src/routes/api.ts`, `web/super_admin/src/components/LoginScreen.tsx` | Configured passcode, timing-safe comparison, IP failure limiter, JWT; no shared production default. MFA/admin account lifecycle still needs launch review. |
| Customer authentication | `services/googleAuth.ts`, `routes/api.ts`, customer `providers/session_provider.dart` | Google ID-token verification; not an SMS OTP login. Real Google project credentials required for device validation. |
| Partner authentication and approval | `routes/partners.ts`, `services/password.ts`, `middleware/auth.ts` | Password hashing, approval/suspension, token revocation implemented. Flutter partner session controllers use real APIs. |
| Catalog and moderation | `routes/catalog.ts`, `services/catalog.ts`, vendor `services/vendor_backend.dart` | Food menu CRUD, price approval and categories implemented; grocery SKU, variants and inventory reservation are missing. |
| Customer discovery | `routes/api.ts`, customer `providers/dhaba_provider.dart` | Existing listings are campus oriented; nationwide address-filtered discovery is not implemented. |
| Serviceability | `config/campus.ts`, `services/vendorLocation.ts` | Campus drop points and 3 km vendor restriction are hardcoded. Must be replaced with enabled cities/zones in Phase 2, not merely removed. |
| Addresses | `prisma/schema.prisma`, customer profile and checkout | Hostel/drop-point fields; no structured multi-address India model. |
| Checkout and money | `services/orderFlow.ts`, `orderGroups.ts`, `pricing.ts` | Server prices, paise calculations, coupons, grouped vendor orders, transaction locking. No inventory availability guarantees yet. |
| Payment gateway | `services/paymentService.ts`, `paymentReconcile.ts` | Razorpay, HMAC verification, reconciliation/refund retry; simulator only in automated tests. Explicit development-only disabled mode added. Real gateway sandbox not verified. |
| Order lifecycle | `services/orderFlow.ts`, `utils/stateMachine.ts`, `routes/orders.ts` | Server-enforced transitions, owner checks and OTP delivery. Integration checks are recorded separately. |
| Dispatch | `services/orderFlow.ts`, `routes/orders.ts` | Rider pool/claim and admin reassignment exist. Multi-city offers, expiry and retry rules need Phase 4. |
| Rider tracking | `realtime.ts`, driver `services/location_source.dart` and rider controllers | Authenticated socket/REST updates and per-order views. Source currently stores fixes outside active delivery and requires stricter retention/authorization work. |
| Real-time privacy | `realtime.ts`, `services/orderView.ts` | Token-authenticated rooms and role-specific payloads. Reconnect and account revocation paths have existing tests. |
| Push notifications | `services/push/`, all three apps' `services/push/` | Firebase Admin/FCM and device registration implemented. No Firestore/Firebase Auth dependency found. Preserve FCM. Live sends need a project under the owner's control. |
| Settlements | `services/settlement.ts`, `finance.ts`, `payoutAccount.ts` | Ledger, encrypted payout details, manual recorded disbursement implemented. RazorpayX is explicitly unavailable, not a working payout integration. |
| Storage | `routes/uploads.ts`, `utils/imageProbe.ts` | Validated local uploads. Durable object-storage adapter, backups and retention need production work. |
| Maps | `config/campus.ts`, admin Leaflet and Flutter Google Maps integrations | Existing campus map and configurable mobile API key; general geocoding/routing adapters not implemented. |
| Support | Existing support links | Complaint/ticket lifecycle missing. |
| Admin dashboards | `web/super_admin/src/App.tsx`, `components/`, backend finance routes | Real API-based orders/finance; cross-city filters and coverage dashboards missing. |
| Rebranding | `branding/brand.json`, `scripts/configure_brand.py` | Neutral DailyMarket identity generates shared names, primary/accent, Android IDs/labels/icons/splash. Internal Kraveo API/class names are retained for compatibility. Remaining copy and landing artwork are not fully rebranded. |
| Infrastructure | `compose.yaml`, environment examples, `backend/scripts/migrate.mjs` | Local database configuration and safe initial bootstrap added. Production deployment is not performed. |

See `05_test_cases.md` for executed checks and `10_remaining_work.md` for the acceptance gate. A checked-in Firebase client configuration is not evidence of access to that project's backend credentials or permission to redistribute its brand assets.
