# Marketplace workflow

Approved choices: one store per new checkout; broadcast after store acceptance; online prepaid or cash collected by the assigned rider at delivery.

Implementation order: additive schema and readiness; server-authoritative checkout and separate cash ledger; simultaneous nearby offers with atomic acceptance; customer discovery/store details; vendor store selection; on-duty rider location and cash confirmation; operator category/owner/city/cash controls; regressions and screenshots.

Rollout: historical orders retain workflowVersion=1 and their existing group/payment contracts. The new marketplace checkout is workflowVersion=2, assigned only by the server. It requires an approved linked owner, active primary store category, confirmed pickup and serviceability. Unresolved old stores remain historical records; operators must finish their configuration before new marketplace checkouts. Cash is disabled per city until an operator enables it. No gateway record is invented for cash. Clerk identities and internal UUID relationships remain intact.

Legacy creation routes return 410 by default. Only an explicit operator `LEGACY_CHECKOUT_ENABLED=true` rollback switch re-enables old checkout. This switch is enabled for historical regression fixtures and its disabled behavior has a separate API test. Never enable it for the new marketplace deployment. Reading, payment and completion of existing orders do not depend on it.
