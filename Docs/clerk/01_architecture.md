# 1. Architecture and inventory

Clerk owns credentials, identity verification, sessions, recovery and sign-out. Grozo PostgreSQL owns UUID business identities, roles, approvals, resources, stock, orders and finance. Firebase remains FCM notifications; Razorpay remains payment verification and capture/refunds.

| Mode | Backend | Clients | Session authority |
| --- | --- | --- | --- |
| `legacy` (default) | Existing authentication | Existing login UI | Existing Grozo sessions, temporary compatibility only |
| `clerk-test` | Only development/test environment and development keys | Native Clerk Android / Clerk React | Clerk only; no legacy fallback |
| `clerk` | Production requires live Clerk keys | Live Clerk instance | Clerk only; activation requires coordinated approval |

Use a distinct database, Clerk instance and deployment for staging. All four interfaces in one environment use the same Clerk application. Never point test builds at the production database. A production Clerk cutover has not been activated.

| Component | Implemented files/behavior |
| --- | --- |
| Identity/database | `backend/prisma/schema.prisma`, additive `20261021060000_clerk_identity`: nullable unique `User.clerkUserId`; existing UUIDs/FKs retained; webhook receipts/tombstones |
| HTTP | `middleware/clerk.ts`, `middleware/auth.ts`, `services/clerkIdentity.ts`: official Clerk middleware, verified bearer identity, online session/user status, database roles |
| Partner application | `routes/partners.ts`: authenticated `/partner/clerk-application`, new pending profile only; no existing-store claim, body-approved role or automatic approval |
| Admin assignment/linking | `scripts/clerk-identity.mjs`: operator-only exact subject linking/provisioning with audit and conflict checks |
| Lifecycle/webhooks | `routes/clerk.ts`, `/auth/logout`, `/auth/account`, deletion retry in `index.ts`: signed webhooks, duplicates/stale events, tombstones, preserved financial IDs |
| Socket.io | `realtime.ts`: verified session handshake, packet/recipient checks, periodic revocation checks, resource room restrictions |
| Android | Shared `packages/grozo_clerk/android/…`; each application's MainActivity/manifest/Gradle configuration; official native Clerk SDK UI |
| Flutter | Shared `kraveo_ui` Clerk session/entry components; all three API, socket and session controllers use SDK tokens in Clerk mode |
| React | `auth/ClerkAdmin.tsx`, `services/api.ts`, `App.tsx`: maintained `@clerk/react`, backend-confirmed admin shell, SDK token getter, no manual Clerk token persistence |
| Deployment | Environment templates, `render.yaml`, migration wrapper, `configure_hosted_admin.mjs`, `web/super_admin/vercel.json` |

`migration-inventory.json` contains tracked source hashes, symbol references, every Express registration/mount and relevant database fields. Regenerate with `node scripts/clerk/inventory.mjs`, check with `--check`. References include retained compatibility code; presence does not mean it is active in Clerk mode.

The legacy public Google, phone/password, passcode and partner-signup endpoints return 410 in Clerk mode. Credential creation/reset routes are guarded too. `generateToken` refuses to issue Grozo sessions in Clerk mode. JSON APIs return 401 for unauthenticated sessions, 403 for insufficient permission, or 404 where existing ownership APIs intentionally conceal another user's resource.
