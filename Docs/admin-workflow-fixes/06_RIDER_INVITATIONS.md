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

Actual focused result: **14 passed / 4 files**, evidence `evidence/task-6-ui-resumed.txt`. Full Admin is now 886/886 and the Clerk-mode build passes. Local Prisma regeneration and backend TypeScript compilation also pass after narrowly approved build-process execution. The initial stale-client diagnostics remain historical evidence, not the current build status.

The new PostgreSQL/HTTP regression is `backend/test/e2e/rider_onboarding_workflow.test.ts`. It passed in the complete CI database invocation. It uses signed synthetic Clerk tokens and a synthetic provider HTTP transport; it does not verify hosted Clerk or physical devices. Local database startup was rejected by automatic approval review; it was not retried or bypassed. CI uses its own dedicated ephemeral PostgreSQL. See 08_VERIFICATION.md for the full-run result and remaining real-provider acceptance gates.
