# 1. Architecture and migration inventory

Status: **stage 1 only; current authentication remains active**. Baseline: `0d2b149887bad33e8db1a7e91898d72f6904b9e6`, branch `feature/india-grocery-platform`.

## Existing flows

| Area | Current implementation | Work needed after mobile feasibility passes |
| --- | --- | --- |
| Customer | `apps/customer_app/lib/services/google_auth_service.dart`, `providers/session_provider.dart`, `screens/auth_screen.dart`, `screens/profile_setup_screen.dart`, `services/customer_api_service.dart`, `main.dart` | Replace owned Google exchange and saved Grozo JWT with Clerk sign-up, sign-in, verification, recovery, profile/session lifecycle and fresh SDK tokens. Preserve address, cart and business profile setup. |
| Vendor | `apps/vendor_app/lib/services/partner_auth_service.dart`, `session/session_controller.dart`, `models/partner_session.dart`, login/signup screens, API and order socket services | Replace credentials/session handling; keep store application, approval, ownership, pending/rejected/suspended states. |
| Rider | Equivalent files in `apps/driver_app`, plus `services/rider_socket.dart` | Replace credentials/session handling; preserve application, approval, duty, dispatch, assignment, GPS and delivery verification checks. |
| Shared mobile storage | `packages/kraveo_ui/lib/src/security/session_tokens.dart` | Retire Grozo session storage consumers after cutover; purge legacy keys. Never copy Clerk credentials into preferences or this custom store. |
| Admin | `web/super_admin/src/main.tsx`, `App.tsx`, `components/LoginScreen.tsx`, `services/api.ts` | ClerkProvider, maintained React SDK, SDK token getter, protected admin shell, profile/sign-out, socket reconnect. Remove passcode and manual localStorage auth only after regression coverage. |
| Backend identity | `backend/src/routes/api.ts`, `routes/partners.ts`, `services/googleAuth.ts`, `services/password.ts` | Replace public login/session issuance, partner password reset and credential creation. Separate identity creation from partner applications/approval. |
| Backend HTTP | `backend/src/middleware/auth.ts`, `middleware/rateLimit.ts`, `index.ts` | Clerk verification, trusted database role mapping, suspension/deletion/revocation, verified per-user rate-limit keys. Current limiter separately verifies the old JWT and must also migrate. |
| Backend sockets | `backend/src/realtime.ts`, partner suspension/disconnect and dispatch publishers | Clerk session verification and ongoing access checks; keep all room/recipient/ownership filtering. |
| Identity lifecycle | `/auth/profile`, `/auth/logout`, `/auth/account`, partner status/reset routes, `backend/src/services/push/deviceTokens.ts` | SDK logout plus owned-device cleanup; deletion/deidentification; provider revocation; transactional subject association. |
| Runtime/deployment | `backend/src/config/runtimeConfig.ts`, `backend/.env.example`, `deploy/.env.production.example`, `render.yaml`, migration/start/smoke scripts, Vercel/CSP tooling, app API configs, Android build/manifest configuration | Replace auth configuration at coordinated cutover. Keep finance/payment secrets, owned Firebase files, TLS, persistence, CORS and signed release guards. |
| Demo/tests | Backend auth harness and e2e suites, mobile auth/session/socket/push tests, admin login/API tests, demo seed and capture/smoke scripts | Adapt to Clerk subjects and verified-session fixtures. Do not give demo accounts a parallel login bypass. Real Clerk verification must remain separate from test doubles. |

`migration-inventory.json` is the complete generated reference index: file hashes, symbol locations, every Express registration and its explicit middleware/inline-handler locations, router mounts, and User/Vendor/DriverPartner/DeviceToken schema fields. Backend routes mount at `/api`; order routes also mount under `/api/v1`. Upload routes use an array of paths and conditional inline authorization; both are recorded. Owner queries and inline guards need manual review even when the listed middleware looks correct.

Regenerate with `node scripts/clerk/inventory.mjs`; check with `node scripts/clerk/inventory.mjs --check`. It reads tracked source/config/tests, never `.env`, private accounts or uploads. Historical migrations are excluded from renaming. A reference is not permission to remove that file.

## Public authentication contracts to replace

| Route (prefix `/api`) | Current behavior | Planned cutover |
| --- | --- | --- |
| `POST /auth/google` | Google verification and Grozo JWT issuance | Remove after Clerk clients pass equivalent checks. |
| `POST /auth/partner-login` | Phone/password and Grozo JWT issuance | Remove. |
| `POST /auth/admin-login` | Shared passcode and Grozo admin JWT issuance | Remove; explicitly provisioned Clerk identities only. |
| `POST /auth/partner-signup` | Password-based identity plus pending partner application | Replace with authenticated application submission; never accept identity/password/approval assignment from its body. |
| `POST /admin/partners` | Admin-created partner credential/business account | Separate invitation/controlled linking from business approval. |
| `POST /admin/partners/:userId/reset-password` | Operator-set partner password | Replace with Clerk recovery/invitation operations. |
| `GET/PUT /auth/profile` | Grozo private profile | Keep business contract; verify Clerk subject, resolve internal user, allow only permitted profile fields. |
| `POST /auth/logout` | Token-version/device revocation | Keep needed owned-device cleanup independently; Clerk must end the actual session. |
| `DELETE /auth/account` | Customer deidentification and session invalidation | Preserve history and business constraints; add provider deletion/retry without allowing future access. |

## Target trust boundary (not implemented)

Use one Clerk application for development and a separate one for production; all four interfaces share the appropriate environment's application. Clerk owns identity, verification, credentials and sessions. PostgreSQL owns roles, store/rider approvals, resource ownership, orders, inventory and money.

Resolve Clerk `sub` through a unique nullable `User.clerkUserId`. Keep `User.id` UUID and every existing foreign key. New subjects may provision a customer record only; a vendor/rider application needs a separate pending business record and explicit review. Merely opening a partner app cannot grant a role or approval. Admin access needs operator provisioning plus trusted database authorization.

No role decision may trust a token's editable metadata, a request body, email/phone matches, a profile field or the client app. API and socket checks must query current Grozo authority. FCM remains notifications; Razorpay remains payments; neither becomes a Clerk identity authority.
