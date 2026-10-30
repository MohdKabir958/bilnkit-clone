# CODEX MASTER PROMPT — GROZO COMPLETE PRODUCTION-READINESS IMPLEMENTATION

## ROLE AND OBJECTIVE

Act as the Principal Software Architect, Senior Flutter Engineer, Senior Backend Engineer, DevOps Engineer, Security Engineer, QA Architect and Product Workflow Analyst responsible for preparing Grozo for production.

**Repository:** `MohdKabir958/bilnkit-clone`

**Primary branch:** `feature/india-grocery-platform`

**Last independently reviewed commit:** `be665d1a71b91bc32c5935ee4108740db9bc1eba`

First fetch the latest branch head. If new commits exist, review and retain their improvements. Never reset or overwrite newer work.

## MAIN INSTRUCTION

I want you to **implement every production-readiness improvement listed below**, not simply audit, recommend or document it.

Divide the overall implementation into separately tracked tasks with clear dependencies, owners/workstreams, implementation steps, tests and acceptance criteria.

Work through all tasks systematically.

You may use separate coding agents, parallel workstreams or subagents for independent tasks, but coordinate integration carefully because authentication, money, inventory, dispatch and order states share the same database and business rules.

Commit work in reviewable, logically separated commits.

Do not force-push, overwrite important commits or deploy directly to production without explicit authorization.

### Applications in scope

1. Customer Flutter application.
2. Vendor Flutter application.
3. Delivery Partner Flutter application.
4. React Admin website.
5. Node.js/Express backend.
6. PostgreSQL/Prisma.
7. Socket.io.
8. Clerk authentication.
9. Firebase Cloud Messaging.
10. Razorpay payment/refund integration.
11. Render, Neon, Vercel and GitHub Actions.

Preserve the current Grozo visual design and branding unless a specific workflow requires a UI improvement.

---

# TASK 00 — ESTABLISH BASELINE AND CREATE IMPLEMENTATION TRACKER

Before editing code:

1. Fetch the newest source.
2. Review the existing implementations.
3. Inspect the latest CI failures.
4. Identify the existing test suites.
5. Map each requested improvement to actual source files.
6. Identify dependencies between tasks.
7. Record what is already implemented and what genuinely needs changes.

Create:

`Docs/production-readiness/00_MASTER_TRACKER.md`

Each task must have:

- Task ID.
- Priority.
- Current implementation status.
- Root cause or design problem.
- Files involved.
- Planned solution.
- Dependencies.
- Acceptance criteria.
- Automated test coverage.
- Actual completion status.
- Commit SHA.
- Remaining verification, if applicable.

Maintain this tracker throughout implementation.

Do not count existing functionality as newly implemented.

Do not mark anything complete solely because a document was written.

---

# TASK 01 — FIX FAILED GITHUB ACTIONS AND PRICING CONCURRENCY

**Priority: P0 — Release blocker**

Confirmed evidence:

GitHub Actions run `40221065266` failed.

Backend results:

- 1,146 passed.
- 1 failed.
- 47 total suites.

Failed test:

`backend/test/e2e/pricing_catalog.test.ts`

Scenario:

"recalculate and edits running together never leave a stale price behind"

The test expected vendor prices 200–205 but observed some original prices alongside updated prices.

### Required investigation

Trace:

- Concurrent catalog edits.
- Price recalculation.
- Commission changes.
- PostgreSQL transaction isolation.
- Row locking.
- Optimistic/concurrent updates.
- Price versioning.
- Rate limiting.
- HTTP response statuses.
- Retry and conflict handling.
- Stale-price detection.

Determine whether the failure is:

1. An actual pricing race condition.
2. A rejected API edit that the test incorrectly assumes succeeded.
3. A rate-limiting problem.
4. A transaction sequencing problem.
5. A test isolation or timing problem.
6. Another independently verified cause.

### Required implementation

Correct the root cause.

Ensure:

- A successful vendor-price update persists.
- Failed edits return explicit errors.
- Recalculation cannot silently overwrite newer authorized prices.
- Commission-derived customer prices remain consistent.
- Product audit history reflects actual changes.
- No duplicate stock or pricing records are created.
- Concurrent Admin actions behave predictably.
- Customer checkout always uses authoritative committed pricing.

Do not disable the test, loosen financial assertions, add arbitrary sleeps or merely rerun until green.

Add targeted concurrent tests and repeat them under CI conditions.

### Acceptance

- Targeted pricing concurrency tests pass repeatedly.
- Entire backend suite passes.
- GitHub Actions backend job is green.
- Price and commission invariants remain correct.

---

# TASK 02 — CLERK AUTHENTICATION AND DEPLOYMENT ALIGNMENT

**Priority: P0**

Current risk:

Published Android APKs use Clerk staging.

However, the repository's primary `render.yaml` defaults to:

`AUTH_MODE=legacy`

It also sets:

`autoDeploy: false`

These settings do not prove the actual Render service is misconfigured, but create a deployment-mismatch risk.

### Required implementation

Audit and reconcile:

- Backend authentication mode.
- Customer APK mode.
- Vendor APK mode.
- Delivery APK mode.
- Admin Vercel mode.
- Clerk application instance.
- Clerk issuer.
- Clerk publishable keys.
- Backend Secret Key.
- JWT verification.
- Authorized parties.
- Android callback configuration.
- Socket.io authentication.
- Clerk webhooks.
- Backend role mapping.

Implement environment-aware configuration validation.

The backend should clearly report its active authentication mode through secure operational diagnostics without exposing secrets.

An incompatible frontend/backend auth configuration should fail clearly rather than repeatedly redirecting users between login screens.

### Preserve security

- Clerk identity does not automatically grant Vendor, Rider or Admin permission.
- Vendor approval remains mandatory.
- Rider approval and service-area assignment remain mandatory.
- Admin must be explicitly provisioned.
- Existing Grozo UUIDs and business relationships remain intact.
- Invalid tokens must fail closed.
- Never introduce an authentication bypass.

Do not automatically enable Clerk-only production mode or remove rollback capability.

Prepare a coordinated final cutover plan, but wait for explicit owner approval before disabling the current production authentication implementation.

### Tests

Verify authentication, authorization, session refresh, logout, account switching, role isolation, revoked identities and Socket.io room access.

Use mocks for isolated tests, but label them accurately.

External Clerk connectivity and physical-device login remain separately required acceptance checks.

---

# TASK 03 — FIX PAYMENT AVAILABILITY AND CHECKOUT WORKFLOW

**Priority: P0**

Current problem:

The marketplace quote endpoint can advertise `ONLINE` payment even when the backend payment provider is disabled or not configured.

This can let customers proceed to a checkout method that cannot succeed.

### Required implementation

Create one authoritative payment-capabilities service.

Return payment methods based on:

- Actual payment-provider readiness.
- Environment mode.
- Vendor and city configuration.
- COD availability.
- Currency and payment rules.
- Operational enable/disable flags.

Customer should only see working payment options.

If Razorpay is unavailable:

- Do not advertise online payment as working.
- Display a clear explanation.
- Allow COD only if explicitly available.
- Do not create a fake successful online payment.
- Do not create an unfulfillable paid order.

Preserve Razorpay security, capture verification, idempotency and reconciliation.

### Payment state design

Explicitly distinguish:

- Payment not initiated.
- Payment pending.
- Payment authorized.
- Payment captured.
- Payment failed.
- Payment verification pending.
- Refund pending.
- Refund processed.
- Refund failed.

Use only states supported by the actual domain/database; design safe additive migrations where needed.

Make the customer app accurately reflect server and provider states.

### Tests

Include:

- Provider disabled.
- Missing keys.
- COD enabled/disabled.
- Provider timeout.
- Failed payment.
- Duplicate webhook.
- Retry.
- Late successful payment.
- Cancelled order receiving payment.
- App closed during checkout.

---

# TASK 04 — FIX PENDING PAYMENT AND ABANDONED CHECKOUT REPLACEMENT

**Priority: P0**

Current behaviour:

Starting a new checkout at the same store can cancel older unpaid orders to release stock and coupon reservations.

Risk:

The customer may have an online payment that is still processing.

If the old order is cancelled while Razorpay later confirms payment, the customer can experience a charge followed by a delayed refund.

### Required solution

Before replacing an unpaid order:

1. Check authoritative payment state.
2. Identify whether a provider payment is still pending or recently initiated.
3. Reconcile uncertain provider state safely.
4. Preserve the original order while confirmation remains unresolved within the defined window.
5. Never fulfill a cancelled order due to a late webhook.
6. Automatically handle late captures through the refund/reconciliation workflow.
7. Release stock and coupon reservations exactly once.

Use idempotency keys for checkout and payment creation.

Show the customer understandable choices:

- Continue pending payment.
- Retry safely.
- Cancel pending order.
- Start new order when allowed.

Do not let the UI encourage duplicate payments.

Add tests for webhook/order cancellation races and transaction failure recovery.

---

# TASK 05 — REDESIGN RIDER DISPATCH TIMING

**Priority: P1 — Major workflow improvement**

Current behaviour:

Rider matching can start while an order is:

- ACCEPTED.
- PREPARING.
- READY_FOR_PICKUP.

This allows a rider to arrive long before packing is completed.

### Required solution

Separate these concepts:

- Vendor accepted order.
- Estimated packing completion time.
- Packing started.
- Packing completed.
- Rider search initiated.
- Rider assigned.
- Rider travelling to store.
- Rider arrived at pickup.
- Order ready for collection.
- Order picked up.

Do not assume matching must wait until `READY_FOR_PICKUP` in every case.

Implement smarter matching:

**Target rider arrival time ≈ estimated order-ready time.**

Use:

- Vendor preparation estimate.
- Actual preparation progress.
- Rider proximity.
- Road travel ETA when available.
- Expected matching delay.
- Rider availability.
- Vendor operating status.

Permit early matching if the order is expected to be ready before or around rider arrival.

Permit immediate matching for already-ready orders.

Prevent unnecessary rider waiting where possible.

Allow safe Admin overrides for genuine operational exceptions.

### UI changes

Vendor:

- Estimated packing time.
- Packing progress.
- Mark ready.
- Rider status.
- Rider arrival notification.

Delivery:

- Offer details.
- Expected pickup-ready time.
- Store preparation status.
- Waiting at pickup.
- Rider arrived.
- Pickup confirmation.

Customer:

- Preparing.
- Finding delivery partner.
- Rider assigned.
- Pickup pending.
- Out for delivery.

Avoid exposing incorrect or premature order status.

### Tests

Cover early assignment, late packing, vendor cancellation, rider decline, offer timeout and rider arrival before order readiness.

---

# TASK 06 — FIX NO-RIDER / NO-CAPACITY CHECKOUT

**Priority: P0/P1**

Current problem:

A customer can order from a serviceable store even if no rider is presently available.

Store serviceability and real delivery capacity are different concepts.

### Required implementation

Create an operational capacity service evaluating:

- Enabled delivery zone.
- Approved available riders.
- Rider freshness/location.
- Current rider workload.
- Expected vendor preparation time.
- Dispatch availability.
- Current demand.
- Configured delivery limits.
- Provider/service outages.

Use this information to produce a conservative fulfillment decision and estimated delivery window.

### Behaviour

If delivery capacity is normal:
- Allow checkout.

If temporarily constrained but realistically serviceable:
- Show an honest longer ETA.
- Allow an explicitly supported queued order with a recovery policy.

If delivery cannot realistically be fulfilled:
- Do not accept online payment for an order without a viable fulfillment path.
- Offer retry later or another available store where appropriate.

Capacity checks must account for data becoming stale between quote and checkout.

Do not claim every queued order is guaranteed a rider.

### Recovery

If an order is accepted but no rider can be assigned:

- Retry using controlled rounds.
- Notify operations.
- Show customer delay status.
- Permit authorized manual assignment.
- Permit cancellation/refund according to policy.
- Record dispatch attempts.

Do not leave orders indefinitely stuck in preparation or pickup readiness.

---

# TASK 07 — IMPROVE RIDER SELECTION AND DELIVERY ETA

**Priority: P1**

Current behaviour:

Rider selection uses straight-line distance, including 3 km and 5 km offer rounds.

Geographic distance is not the same as driving distance.

### Required implementation

Create a routing/ETA abstraction that can use a properly configured road-routing provider.

Evaluate available commercial options and licensing before selecting a provider.

Do not hardcode credentials.

Use:

- Straight-line distance for fast initial filtering.
- Road-network ETA/distance for candidate ranking when available.
- Cached estimates to control cost.
- Reasonable rate limits.
- Provider outage fallback.
- Clearly labelled estimated values.

### Required customer functionality

Show an ETA that is updated at important order stages:

- Before checkout.
- After vendor acceptance.
- During preparation.
- Rider assignment.
- Pickup.
- Delivery in progress.

Do not promise ten-minute delivery unless actual operational data supports it.

### Required Admin functionality

Provide configurable SLA thresholds.

Alert on:

- Vendor delay.
- Rider search delay.
- Pickup delay.
- Delivery delay.
- Missing delivery updates.

If road-routing credentials are unavailable, implement the provider interface, fallback, tests and setup instructions, and mark live routing unverified.

---

# TASK 08 — IMPROVE GPS VERIFICATION AND LOCATION RECOVERY

**Priority: P1**

Current implementation requires approximately:

- GPS reading less than two minutes old.
- Rider within 200 metres of pickup/drop-off.

This improves security but may reject real deliveries when phone location is inaccurate.

### Required solution

Preserve location-based verification without creating a rider-controlled bypass.

Add:

- GPS accuracy evaluation.
- Timestamp validation.
- Device-permission handling.
- Location refresh.
- Weak-signal guidance.
- Pin correction workflow.
- Validated pickup/drop-off arrival checks.
- Explicit error explanations.
- Audited operational exception handling.

If GPS is inaccurate, give the rider a retry/recovery flow.

Admin overrides must require:

- Explicit authorization.
- Reason.
- Independent verification evidence.
- Audit log.
- Optional additional approval for high-risk actions.

A rider must not independently override delivery proof or mark any remote location as verified.

Protect against stale, impossible or manipulated location submissions where feasible.

Review privacy and retention of rider location history.

### Tests

Include stale GPS, permission denied, weak accuracy, wrong pin, fake/replayed updates, background/resume and manual override authorization.

---

# TASK 09 — IMPROVE VENDOR ACCEPTANCE AND PACKING TIMEOUTS

**Priority: P1**

Current default vendor acceptance timeout is ten minutes.

This can cancel legitimate orders if notification delivery is delayed or a store is temporarily busy.

### Required implementation

Provide configurable, bounded vendor response SLAs.

Add:

- Vendor order acknowledgment countdown.
- Reliable in-app pending-order queue.
- Notification retries where provider is configured.
- Vendor busy/unavailable status.
- Preparation time estimates.
- Admin escalation before timeout.
- Customer delay communication.
- Controlled auto-cancellation.
- Appropriate refunds for captured online payments.

Ensure the policy accounts for COD separately.

Do not extend orders forever.

Preserve safety around race conditions when the vendor accepts just as the timeout worker cancels.

Test expiration/acceptance concurrency and app-background scenarios.

---

# TASK 10 — FIX INVENTORY HANDLING, PACKING AND SHORTAGES

**Priority: P1**

Current behaviour:

Inventory reserved at checkout can be restored automatically when cancellation occurs before pickup.

This is not always correct for physical grocery stock.

Products may have been:

- Packed.
- Damaged.
- Spoiled.
- Opened.
- Consumed during preparation.
- Marked missing.

### Required solution

Add appropriate inventory reconciliation for:

- Reserved.
- Physically available.
- Packed.
- Missing.
- Damaged.
- Expired.
- Sold.
- Returned to stock.
- Written off.

Do not automatically restore damaged/unusable stock.

If the order is cancelled before pickup, determine the correct disposition of each reserved item.

Provide Vendor controls to verify or adjust stock.

Maintain transactional inventory updates and audit history.

### Grocery inventory improvements

Add:

- Optional batch/lot tracking.
- Expiry/best-before date.
- Low-stock alerts.
- Expired-product blocking.
- Stock correction reasons.
- Optional barcode identification.
- Product variants/pack-unit consistency.

Preserve existing SKU, pricing, tax and inventory structures.

Use additive migrations where necessary.

Do not introduce camera permission solely for barcode support unless the feature is implemented and legitimately needed.

---

# TASK 11 — IMPLEMENT MISSING ITEM SUBSTITUTIONS AND PARTIAL REFUNDS

**Priority: P1**

Build a complete grocery-specific exception flow.

Example:

Customer orders a 1-litre milk packet, but the vendor finds that product unavailable while packing.

### Vendor flow

Vendor can:

1. Mark an item unavailable.
2. Suggest an authorized replacement.
3. Mark quantity shortage.
4. Request customer approval.
5. Continue preparation after a decision.

### Customer flow

Customer can:

- Accept replacement.
- Reject replacement.
- Request removal of missing item.
- Approve an applicable revised total.
- See updated packing and payment information.

### Financial requirements

All changes must be server-authoritative.

Handle:

- Replacement cheaper than original.
- Replacement more expensive than original.
- Same-price replacement.
- Removed item.
- Partial quantity shortage.
- Coupon allocation.
- Tax difference.
- Platform fee and delivery-fee policy.
- Vendor settlement adjustments.
- Already-captured Razorpay payments.
- COD totals.

Never silently charge more than the customer authorized.

If additional payment is needed, use an explicitly authorized provider flow or disallow the substitution and offer a supported alternative.

If less money is owed, issue an accurate partial refund or authorized provider adjustment.

Never mark an asynchronous refund as completed until its provider outcome is confirmed.

### Important

Existing full-order refund and payment reconciliation must continue working.

Use idempotent refund records and immutable financial history.

Prevent double refunds and incorrect settlement amounts.

Test every replacement/payment scenario.

---

# TASK 12 — COMPLETE COD COLLECTION AND RECONCILIATION

**Priority: P1**

Current implementation records COD collection after delivery-code verification, with Admin recording subsequent cash handover.

Keep these safeguards.

### Add

- Rider cash balance.
- Cash expected.
- Cash actually received.
- Cash handed to company.
- Shortage/overage.
- Pending remittances.
- Disputed collections.
- Failed handovers.
- Cash refund records.
- Supervisor review.
- Reconciliation history.
- Daily cash closing.

Each monetary event must have an immutable, traceable audit record or equivalent append-only financial evidence.

Do not treat a rider's confirmation as proof that physical money has reached Grozo.

Separate:

1. Customer paid rider.
2. Rider owes platform.
3. Platform received cash.
4. Reconciled.
5. Disputed/refunded where applicable.

Preserve exact-money rules and paise-level precision.

Do not enable COD in cities where the feature is disabled.

Test fraud, double-confirmation, wrong amounts, duplicate handovers and interrupted settlement.

---

# TASK 13 — UNIFY ADMIN OPERATIONS AND EXCEPTION MANAGEMENT

**Priority: P1**

Existing Admin already supports:

- Orders.
- Dispatch.
- Needs-attention views.
- Support cases.
- Refund administration.
- Finance.
- Vendor/rider approval.
- Audit logs.

Do not rebuild these modules.

Integrate them into a unified operational control experience.

### Admin Operations Command Center

Show live, actionable problems:

- Order awaiting vendor acceptance.
- Vendor taking too long.
- Order ready without rider.
- No eligible rider.
- Rider offer rounds exhausted.
- Rider waiting at pickup.
- Rider GPS unavailable.
- Delivery delayed.
- Customer unreachable.
- Failed payment.
- Refund pending too long.
- Stock shortage.
- Substitution awaiting approval.
- COD mismatch.
- Vendor/rider suspension issue.
- Support ticket overdue.

Every exception should include:

- Severity.
- Order/reference ID.
- Current owner.
- Time created.
- SLA.
- Available actions.
- Audit history.
- Resolution status.

### Recovery actions

Authorized Admin should be able to:

- Retry dispatch.
- Assign/reassign eligible rider.
- Contact appropriate parties.
- Request GPS revalidation.
- Resolve approved stock exceptions.
- Issue supported refunds.
- Trigger safe reconciliation.
- Escalate.
- Record a resolution.

Preserve RBAC.

Avoid allowing the same financial or delivery action to execute twice through simultaneous Admin operations.

Add tests for permissions, concurrent actions and audit completeness.

---

# TASK 14 — IMPROVE CUSTOMER SUPPORT WORKFLOWS

**Priority: P1**

There is an existing SupportCase system.

Extend it rather than introducing a separate unrelated ticket system.

### Customer issues

Add structured categories such as:

- Missing item.
- Wrong item.
- Damaged item.
- Expired item.
- Delayed delivery.
- Rider problem.
- Payment failed but charged.
- Refund not received.
- Delivery failed.
- Other.

Support appropriate evidence attachments and controlled media storage.

### Required features

- Ticket priority.
- Status.
- Assigned support owner.
- Order linkage.
- Evidence.
- Customer/vendor/rider conversation or notes, with proper authorization.
- Escalation timer.
- Resolution.
- Refund/replacement linkage.
- Reopen.
- Full audit history.

Customers must see meaningful status updates.

Ensure one party cannot view another customer's private support information.

Use safe file upload validation, authorization and retention.

---

# TASK 15 — MAKE NOTIFICATIONS RELIABLE

**Priority: P0/P1**

Current staging APKs have Firebase push disabled due to missing owned configuration.

Preserve the existing FCM implementation.

Do not insert fake Firebase credentials.

### Required engineering work

Verify or implement:

- Per-app Firebase configuration.
- Device token registration.
- Account ownership of device tokens.
- Token refresh.
- Logout cleanup.
- Notification deep links.
- Android notification channels.
- Background/foreground behaviour.
- Vendor new-order notifications.
- Vendor packing alerts.
- Rider delivery offers.
- Offer expiry handling.
- Customer order updates.
- Cancellation/refund alerts.
- Support updates.

Use the existing durable notification-intent mechanisms.

Ensure delayed notifications cannot display expired rider offers as actionable.

If FCM is unavailable, the apps must still provide safe in-app status synchronization. Do not pretend background alerts will work without an actual push provider.

Build and document a test matrix for Android foreground, background, force-closed, weak-network and device-restart behaviour.

Real push delivery remains unverified until owned Firebase credentials and a physical device are supplied.

---

# TASK 16 — HARDEN BACKGROUND JOBS AND TRANSACTIONAL RELIABILITY

**Priority: P0**

Current background maintenance includes:

- Payment expiry.
- Vendor acceptance expiry.
- Refund retries.
- Razorpay reconciliation.
- Rider dispatch.
- Notification retries.
- Location retention.
- Settlement processing.

Parts of this work run through timers inside the backend process.

### Required implementation

Audit every background job for:

- Restart recovery.
- Missed schedules.
- Overlapping execution.
- Multi-instance duplication.
- Partial failure.
- Infinite retry loops.
- Provider outage.
- Dead-letter/manual recovery.
- Transaction safety.
- Idempotency.
- Observability.

Implement a durable job-leasing or queue-backed execution strategy suited to the existing PostgreSQL architecture.

Use the smallest secure, maintainable solution that meets the reliability requirements.

Do not add Redis, Kafka or another paid infrastructure dependency without demonstrating why PostgreSQL-backed durable processing cannot satisfy the initial workload.

### Architecture

Clearly separate:

- Public API responsibilities.
- Background work execution.
- Job scheduling.
- Job ownership/leases.
- Operational monitoring.

Make the solution safe for the current one-instance Render deployment and future multiple-instance deployment.

Do not accidentally run the same refund, payout or dispatch transition twice.

Add crash/restart and duplicate-worker tests.

---

# TASK 17 — PRODUCTION DEPLOYMENT, DATABASE AND STORAGE

**Priority: P0**

Target architecture:

- Render: Node.js backend.
- Neon: PostgreSQL.
- Vercel: Admin website.
- Clerk: authentication.
- Firebase: push notifications.
- Razorpay: payments.
- Persistent object/file storage: product images and authorized attachments.

### Required work

Review and correct:

- Render Blueprint.
- Startup validation.
- Staging vs production configuration.
- Database URLs.
- Prisma migrations.
- Neon direct migration connection.
- Neon pooled runtime connection.
- Connection limits.
- Database indexes.
- Backend CORS.
- Vercel CSP.
- Clerk trusted origins.
- Socket.io connection settings.
- HTTPS/WSS.
- Upload persistence.
- Secret management.
- Health checks.
- Readiness checks.
- Deploy/version compatibility.

Implement a configuration contract ensuring incompatible frontend, backend and mobile versions are reported clearly.

### Backups and recovery

Document and test:

- Database backups.
- Restore to an isolated database.
- Migration rollback/forward recovery.
- Persistent upload restoration.
- Incident rollback.
- Secrets rotation.
- Failed deployment recovery.

Do not run destructive commands against live Neon data.

Do not turn on production auto-deployment without approval.

Do not create paid cloud resources without authorization.

---

# TASK 18 — SECURITY, PRIVACY AND FINANCIAL HARDENING

**Priority: P0**

Conduct a focused review of:

- Clerk session verification.
- Privileged Admin provisioning.
- Vendor/store ownership.
- Rider assignment authorization.
- Customer order privacy.
- Socket.io room permissions.
- Rate limiting.
- Abuse prevention.
- File upload security.
- SQL/Prisma usage.
- Secret exposure.
- Stored personal data.
- Delivery locations.
- Payment/refund idempotency.
- COD fraud.
- Financial ledgers.
- Sensitive logging.

### Implement

- Missing authorization protections.
- Secure input validation.
- Least-privilege access.
- Appropriate account suspension handling.
- Retention/deletion policies.
- Secure diagnostic logging.
- Dependency vulnerability checks.
- Reproducible security tests.

Do not remove existing protections to make tests pass.

Never commit production secrets, Clerk Secret Keys, Razorpay private keys or Firebase service-account credentials.

Require rotation of previously exposed Clerk secrets before use.

Maintain financial and order-history integrity during account deletion.

---

# TASK 19 — COMPLIANCE, TAX, SELLER DOCUMENTS AND INVOICES

**Priority: P1**

Prepare the system for a legitimate Indian grocery delivery business.

### Vendor onboarding

Add configurable compliance review appropriate to the vendor/business type.

Potential information includes:

- Business name and address.
- Business contact details.
- Applicable FSSAI licence or registration.
- GST details where applicable.
- Authorized seller identification.
- Document verification.
- Expiry reminders.
- Approval/rejection reasons.

Do not assume every vendor has identical regulatory obligations.

Provide Admin verification controls and a clear approval decision trail.

### Invoices

Implement appropriate order invoices/receipts showing:

- Seller details.
- Customer/order reference.
- Items and quantities.
- Price breakdown.
- Applicable taxes.
- Discounts.
- Delivery charges.
- Payment method.
- Refund/adjustment records.

Use tax rules consistent with verified legal/business requirements. Do not invent a universal tax rate.

Add privacy policy and account-deletion integration points across the apps.

Verify current Google Play publishing, Android SDK, Data Safety and app-distribution requirements before finalizing release configurations.

Flag legal or tax decisions that require professional/operator confirmation rather than guessing.

---

# TASK 20 — GROCERY PRODUCT AND VENDOR EXPERIENCE

**Priority: P2**

Improve the operational product tools without redesigning the entire app.

Add or refine:

- Store opening/closing schedules.
- Temporary busy mode.
- Preparation-capacity settings.
- Stock-out handling.
- Low-stock notifications.
- Expiry/batch warnings.
- Barcode/SKU lookup where supported.
- Product approval visibility.
- Rejected-product resubmission.
- Vendor performance metrics.
- Order preparation time analytics.
- Cancellation and shortage reports.

Ensure all functions operate for the correct approved store.

Keep existing multiple-store ownership support.

Do not permit cross-vendor stock or order access.

---

# TASK 21 — AUTOMATED PAYOUT READINESS AND FINANCIAL RECONCILIATION

**Priority: P2**

Existing Grozo contains vendor settlement and rider payout records.

Do not replace the ledger.

Improve:

- Settlement eligibility.
- Hold/release.
- Reconciliation.
- Payout failure.
- Duplicate-payment prevention.
- Adjustment tracking.
- Chargeback/dispute handling where relevant.
- COD remittance deduction.
- Refund and settlement linkage.
- Exportable finance reports.

Create a secure provider abstraction for eventual automated disbursements.

**Do not activate actual bank payouts or transfer real funds without explicit authorization and configured provider credentials.**

A safe implementation may include fully tested sandbox/provider adapters and an explicit disabled-by-default live execution flag.

Do not pretend a ledger entry is proof of bank transfer.

---

# TASK 22 — REAL-DEVICE UX, OFFLINE AND RECOVERY

**Priority: P1**

Review all three Flutter applications for:

- First launch.
- Clerk sign-in.
- Session restoration.
- Approval pending.
- Approval rejected.
- Account suspended.
- Offline state.
- API timeout.
- Backend unavailable.
- Refresh and retry.
- App background/resume.
- Phone restart.
- Slow network.
- Duplicate button taps.
- Navigation/deep-link failure.
- Socket.io reconnect.
- Expired rider offers.
- Device permission denied.
- Notification failure.
- Invalid or unavailable store location.

Never show a fake successful operation when the server did not accept it.

Use recoverable UI states with clear explanations.

Preserve the existing Grozo theme, navigation and current visual design.

Create manual Android test instructions and a Pass/Fail sheet.

I will perform physical-device testing.

---

# TASK 23 — PERFORMANCE, LOAD TESTING AND SCALABILITY

**Priority: P1/P2**

Benchmark the application under a realistic controlled pilot workload.

Test concurrent:

- Customer browsing.
- Vendor inventory edits.
- Checkout.
- Payment callbacks.
- Rider availability updates.
- Rider offer broadcasts.
- Driver acceptance.
- Order updates.
- Notification retries.
- Background settlement.
- Admin operations.

Identify:

- Slow queries.
- Missing indexes.
- N+1 queries.
- Large payloads.
- Excessive polling.
- Socket room scaling concerns.
- Database connection exhaustion.
- Unbounded retries.
- Excessive location writes.
- Memory leaks.
- High CPU usage.

Implement justified optimizations.

Use realistic synthetic data.

Never run destructive load tests against the live customer database.

Publish before/after measurements with exact test conditions rather than claiming unsupported throughput.

---

# TASK 24 — COMPLETE REGRESSION AND END-TO-END VERIFICATION

**Priority: P0**

After integration, run every relevant suite.

### Backend

- Full Jest suite in one invocation.
- Pricing concurrency.
- Order placement.
- Online payments.
- COD.
- Refunds.
- Reconciliation.
- Inventory.
- Product substitutions.
- Rider dispatch.
- GPS validation.
- Clerk roles.
- Vendor/rider approval.
- Support cases.
- Background job recovery.
- Finance and payouts.
- Legacy order compatibility.

### Customer Flutter

Run:

- Flutter analyze.
- Flutter tests.
- Android build.
- Checkout and payment state tests.
- Order tracking tests.
- Offline recovery tests.

### Vendor Flutter

Run:

- Flutter analyze.
- Flutter tests.
- Android build.
- Approval and ownership tests.
- Packing/stock/substitution tests.

### Delivery Flutter

Run:

- Flutter analyze.
- Flutter tests.
- Android build.
- Offer acceptance tests.
- GPS and pickup tests.
- COD and delivery-code tests.

### Admin

Run:

- Admin tests.
- TypeScript checks.
- Production build.
- RBAC tests.
- Operations dashboard tests.
- Refund/finance tests.

### GitHub Actions

All required CI checks must be green for the final source commit.

Fix failures at their causes.

Do not hide failing tests, use silent test skips or manipulate test totals.

Distinguish fixture-based tests from real external provider tests.

---

# TASK 25 — UPDATED APKs AND HANDOVER

Build the latest installable Android APKs after completing all applicable work.

Required:

- Customer APK.
- Vendor APK.
- Delivery APK.

Use consistent versioning and a matched source revision.

Configure the correct staging Render HTTPS backend and Clerk instance.

Do not use `10.0.2.2` for connected physical-phone test builds.

### Verify each APK

- Package ID.
- Version.
- ARM64 compatibility.
- Android minimum SDK.
- Signing certificate.
- ZIP integrity.
- SHA-256.
- Public API origin.
- Clerk environment.
- Dangerous permissions.
- Accidentally embedded secrets.
- Installation/update compatibility.

Make APKs available from stable, working GitHub download links.

Preserve existing historical artifacts.

Create a human-readable handover containing:

- APK links.
- Checksums.
- Source commit.
- Build commands.
- Firebase status.
- Payment status.
- Clerk testing instructions.
- Known limitations.

Do not claim physical-device verification unless it actually happened.

---

# REQUIRED IMPLEMENTATION METHOD

## A. Divide and track the work

Create separate tasks corresponding to TASK 00–25.

Group them into these phases:

### Phase A — Immediate correctness and security

TASK 00, 01, 02, 03, 04, 16, 18.

### Phase B — Order and delivery workflow corrections

TASK 05, 06, 07, 08, 09, 10, 11, 12.

### Phase C — Admin and user operations

TASK 13, 14, 15, 20, 22.

### Phase D — Production infrastructure and business requirements

TASK 17, 19, 21, 23.

### Phase E — Final verification and handover

TASK 24, 25.

Implement all phases, respecting dependencies.

You may work on independent tasks concurrently, but do not merge conflicting changes without running integration tests.

## B. Fix the code, not just the documentation

For every task:

1. Confirm existing behaviour.
2. Identify the root cause or gap.
3. Design the safest solution.
4. Implement backend changes.
5. Implement required database changes.
6. Update affected Flutter/Admin interfaces.
7. Add automated tests.
8. Run targeted tests.
9. Run affected integration tests.
10. Commit the completed change.
11. Update the master tracker.

Do not repeatedly stop to ask for approval for ordinary local code changes or tests.

Do ask for explicit approval before destructive data operations, production authentication cutover, live financial transfers or paid external resource creation.

## C. Preserve compatibility

Do not break:

- Existing database UUIDs.
- Historical multi-store/grouped orders.
- One-store new checkout.
- Existing order/payment relationships.
- Existing stock reservations.
- Refund and settlement history.
- Delivery proof.
- Clerk identity associations.
- Vendor/rider approval.
- FCM integration.
- Razorpay.
- Existing Admin reporting.
- Existing Grozo UI branding.

Use additive database migrations whenever possible.

Some old internal enum values and API identifiers refer to campus/restaurant/gate concepts. Do not blindly rename them and break migrations or historical records.

Prefer safe compatibility mappings and correct user-facing terminology.

## D. Financial correctness comes first

No feature may:

- Charge customers twice.
- Refund twice.
- Settle the same order twice.
- Let riders claim the same order simultaneously.
- Assign busy riders incorrectly.
- Lose captured payments.
- Restore unusable stock.
- Mark cash as remitted before verified handover.
- Give access to another vendor's inventory.
- Let a customer self-assign an Admin/Rider/Vendor role.

Use PostgreSQL transactions, idempotency and audit trails wherever necessary.

## E. Do not fabricate external verification

If Clerk, Firebase, Razorpay, Render, Neon, Vercel, a mapping API or a physical device is unavailable:

- Complete the relevant code.
- Provide environment templates.
- Build and test supported components.
- Use explicitly labelled mocks in automated tests.
- Document the exact missing external dependency.
- Continue independent tasks.

Do not claim live integration passed without evidence.

Do not use real financial credentials or production data as substitutes for test configuration.

---

# FINAL DELIVERABLES

Create:

`Docs/production-readiness/00_MASTER_TRACKER.md`

`Docs/production-readiness/01_WORKFLOW_FINDINGS.md`

`Docs/production-readiness/02_IMPLEMENTED_FIXES.md`

`Docs/production-readiness/03_SECURITY_REVIEW.md`

`Docs/production-readiness/04_DATABASE_MIGRATIONS.md`

`Docs/production-readiness/05_DEPLOYMENT_GUIDE.md`

`Docs/production-readiness/06_FULL_TEST_RESULTS.md`

`Docs/production-readiness/07_ANDROID_TEST_GUIDE.md`

`Docs/production-readiness/08_OPERATIONAL_RUNBOOK.md`

`Docs/production-readiness/09_REMAINING_EXTERNAL_BLOCKERS.md`

`Docs/production-readiness/10_FINAL_HANDOVER.md`

Provide a final summary table:

| Task | Implemented | Tests | Commit | Remaining verification |
|---|---|---|---|---|
| TASK 00–25 | Yes/Partial/Blocked | Pass/Fail/Not run | SHA | Exact reason |

Include:

1. Final GitHub branch and commit.
2. Number of changed files.
3. Summary of every implemented workflow correction.
4. Database migrations.
5. Exact backend test results.
6. Exact Admin test results.
7. Exact Flutter test results.
8. GitHub Actions links and status.
9. Security findings and fixes.
10. Deployment configuration.
11. Production-readiness blockers.
12. Latest three APK download links.
13. APK checksums and signing information.
14. Manual test checklist.
15. Operational recovery procedures.

## FINAL ACCEPTANCE CRITERIA

The work is ready for a controlled production-release review only when:

- GitHub Actions is green.
- Pricing remains consistent during concurrent updates.
- Payment options reflect actual provider availability.
- Checkout cannot silently create duplicate charges.
- Vendor readiness and rider dispatch timing are coordinated.
- Orders cannot remain stuck indefinitely without escalation.
- GPS errors have safe recovery flows.
- Inventory and refunds remain financially consistent.
- COD handover can be reconciled.
- Admin can see and resolve operational exceptions.
- All role/ownership checks remain secure.
- Scheduled jobs survive restart and prevent duplicates.
- Deployment configuration is consistent across apps.
- Backups and restoration are verified.
- Required automated tests pass.
- Three updated APKs are available.
- External live-service and device checks are clearly documented.

Passing source tests alone does not authorize production launch.

## MOST IMPORTANT INSTRUCTION

**Do the whole implementation, task by task.**

Do not stop after TASK 01, a feasibility report, an architecture document or a partially completed phase.

Maintain a clear progress tracker.

If an individual task is blocked by credentials, hardware or live-provider access, complete every safe implementation and test step possible, record the exact blocker, and move to the next independent task.

Never weaken application security just to satisfy the requirements.

Never report unfinished work as completed.

Your objective is to turn Grozo from a staging-tested grocery marketplace into a reliable, secure, operationally complete system ready for final real-device testing and production launch approval.

**Begin by inspecting the latest repository state, creating the task tracker, and implementing Phase A. Continue through all phases and provide evidence of every completed task.**
