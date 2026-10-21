# 6. Identity migration and rollback design

Status: **no schema/data change was applied**. Do not run a production migration from this worksheet.

## Additive schema phase after mobile validation

Add nullable unique `User.clerkUserId` without changing UUID primary keys. Add the reviewed webhook delivery/version/tombstone records needed for idempotency and account deletion. Generate and inspect a new Prisma migration, test both a fresh database and an existing seeded database, and preserve every historical migration checksum.

Keep `phone`, `email`, `googleSub`, `passwordHash`, `tokenVersion`, `deletedAt`, `role` and all relations initially. Their retention/removal has separate privacy and compatibility implications; do not rename/delete them simply because authentication changes. Preserve orders, groups, addresses, vendor/user associations, rider assignments, reviews, devices, payouts and financial foreign keys.

## Controlled existing-account linking

Build an operator-only linking procedure with an explicit internal UUID and Clerk user ID. Verify provider identity and ownership through an approved migration process, record who authorized the link, and use a database transaction. The same exact mapping should return success on retry. An existing conflicting subject or already-linked UUID must fail without modifying either identity. Unique constraints must resolve concurrent attempts safely. Never use matching email/phone as proof of ownership.

Use synthetic records in a dedicated test database to verify before/after UUIDs and related order/payment/address/assignment rows. Do not use live customer accounts to test this procedure.

New users provision by subject, not by joining on identity attributes. Provision customers only by default; partner applications and admin promotion remain separate approved operations. Webhooks and first-request provisioning must converge on the same row.

## Coordinated cutover

1. Pass the real mobile feasibility gate, then implement the safe additive schema/linking phase.
2. Integrate backend verification/DB roles, admin, customer, vendor and rider clients in the requested sequence; add webhook/socket lifecycle handling.
3. Pass equivalent provider, ownership, payment, lifecycle and revocation checks before removing old login issuance and custom token consumers.
4. Remove legacy public login endpoints, old session issuance/storage, admin passcode and unused credential/reset code. Update startup/deployment requirements together. Verify no public endpoint can issue a Grozo session independently.
5. Run full regressions in one invocation and build all Android clients before deploying a reviewed release. Do not mix partially migrated clients and backend on production.

## Rollback

At this stage rollback is unnecessary: the production/runtime files and schema are unchanged. Reverting this change removes only tooling/docs/probes.

For a later cutover, prepare tested application/database backups and an operator runbook before deployment. Prefer rolling back application versions while retaining additive subject columns and migration audit records. Do not drop identity associations or historical finance rows. Never silently re-enable a weaker public login path to resolve a Clerk outage; review compatibility and security before any coordinated rollback.
