# Rider onboarding implementation

The delivery partners toolbar separates **Invite rider**, **Add rider** for an already verified account, and **Review applications**. Add rider checks verified identity and business eligibility before Vehicle/Review. Existing applications and HTTP 409 identity conflicts are distinct from actual HTTP 429 throttling. Retry-After disables manual resubmission for the stated period; no POST is retried automatically.

An authorized administrator records consent and creates a random 256-bit invitation. Only its SHA-256 digest is stored. Links expire after 72 hours, may be revoked, and can be redeemed only by the intended verified Clerk identity. Redemption is serialized with final account linking; it does not assign a role, approve a rider, enable duty or assign a delivery. Customer order history, store ownership, administrator access, deletion and suspension block account repurposing. The final existing administrator workflow still explicitly decides approval; riders start OFFLINE.

The provider sign-in/signup components are Clerk components. The invitation fragment is removed from the address bar; its short-lived pending value is retained only in sessionStorage to survive authentication callbacks. Clerk bearer tokens are obtained through the SDK and never manually persisted. No personal operator account is used for testing.

Email delivery is deliberately unconfigured. The UI says **Invitation link created · no email sent** and supports manual sharing with the consenting partner. No provider email success is claimed. Set backend ADMIN_URL to the exact trusted admin origin to construct links. Existing Clerk keys and authorized parties must match that environment. Do not put secrets in the frontend.

## Migration and verification

Run `npx prisma generate` then the existing controlled migration command against an isolated staging database before deploying matching backend/admin commits. The additive `20261027010000_rider_invitations` migration creates no users and modifies no historical records. Readiness probes the invitation table so an unmigrated database cannot appear ready. Do not run this migration on the hosted database without approval.

Focused frontend command (web/super_admin):

```sh
node node_modules/vitest/vitest.mjs run src/components/RiderIdentityWorkflow.test.tsx src/components/PartnerOnboarding.test.tsx src/services/ApiRetryAfter.test.ts src/auth/RiderInvitePage.test.tsx --pool=threads --poolOptions.threads.singleThread
```

Actual result: **14 passed / 4 files**, evidence `evidence/task-6-ui-resumed.txt`. Admin TypeScript/Vite default build also passed (`task-6-admin-build-final.txt`); Clerk-specific build and full suites remain pending.

The new PostgreSQL/HTTP regression is `backend/test/e2e/rider_onboarding_workflow.test.ts`. It uses signed synthetic Clerk tokens and a synthetic provider HTTP transport; it does not verify hosted Clerk or physical devices. Database execution remains blocked by local networking permission. Local Prisma generation is separately blocked by sandbox child-process EPERM: it printed schema-loaded but exited without regenerating. An escalation was aborted; no further escalation was attempted. Backend TypeScript currently reports the stale generated client missing RiderInvitation (`task-6-backend-build-resumed.txt`). This is **not a passing backend build**. Do not deploy this source until generation, migrations and full regressions pass in an enabled environment.
