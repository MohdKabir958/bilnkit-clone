# Additive database changes and rollout

Existing UUID primary keys, Clerk associations, order/product/payment/refund/settlement references and historical grouped orders remain. No migration reset or live database overwrite was performed.

New migrations in this work:

- `20261025192000_production_readiness`: additive packing/capacity/GPS/recovery fields and persistence for stock lots/physical disposition, customer item-change approval, partial-refund intent, durable payment creation, operational support/evidence, append-only cash evidence/closing, durable job ownership, seller compliance and payout-readiness support. Existing fields remain compatible. Cash-evidence database protection rejects ordinary update/delete operations.
- `20261026094000_partial_refund_submission`: nullable `PaymentRefund.submitStartedAt`. Existing already-attempted rows are conservatively backfilled so deployment cannot blindly resubmit an uncertain monetary request.

The retained `fe8b9be` regression and isolated backup/restore drill applied all **26** then-existing repository migrations. The current release applied all **27** migrations in a fresh complete 1,238-test regression and a new isolated PostgreSQL backup/restore drill. The drill additionally verifies the private support thread and its outbox/hashed-acknowledgment context, identity mapping, order/payment/stock snapshots and all migration checksums. See `evidence/release-final/` and `evidence/recovery/database-recovery.json`. See `evidence/backend-final/` and `evidence/recovery/database-recovery.json`. Migration checksums, internal identity associations, order/payment history and stock snapshots were preserved through the isolated restore.

- `20261026140000_support_notifications`: additive support-note association and unique intent, nullable order association for support cases without an order, and a database check requiring at least one legitimate context. Public admin replies stage their outbox entry in the same transaction; internal notes never do. Recipient receipts are token hashes in the private intent, fenced to its current lease. Existing order notification payloads remain compatible. Older clients safely ignore the new support event; older server code can expire it, so roll forward to restore support notifications after an application rollback.

Use Neon pooled runtime and direct migration URLs for the same intended database/branch, with TLS. Back up database and public/private files first, stop incompatible writers during the approved rollout and run the existing migration wrapper. Never edit an applied checksum or call destructive reset/db-push commands on deployed data.

Rollback is primarily application rollback plus reconciliation: keep additive columns/tables and financial/stock evidence, roll back compatible client/server source, stop new workflows deliberately and investigate outstanding payment/refund/job claims. Do not drop new financial evidence to make an older application run. Restoring an actual production backup is a separate owner-approved recovery action with explicit downtime/data-loss assessment; the included tools intentionally restore only into isolated empty test targets.

Readiness probes required release columns and unfinished migrations before reporting ready. Connection success by itself is insufficient. Deployment and isolated recovery steps are in `DEPLOYMENT_AND_RECOVERY.md`.
