# Backend verification checkpoint

The complete backend regression finished in one invocation against a fresh local PostgreSQL database. This is a verification checkpoint during implementation, not a production release or a physical-device/provider certification.

- Passed: 1225; failed: 0; skipped: 0; total: 1225.
- Suites: 55; duration: 585902 ms; exit code: 0.
- PostgreSQL: PostgreSQL 17.11 (Debian 17.11-0+deb13u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit.
- Node: v24.19.0; platform: linux/x64.
- Database: `grozo_final_1793008103645_test`, isolated local UTF8 database; all migrations applied before Jest.
- Started: 2026-10-26T09:48:39.402Z; finished: 2026-10-26T09:58:25.341Z.

Command:

```bash
source /workspace/.setup/grozo-env.sh
QA_EVIDENCE_DIR=Docs/production-readiness/evidence/backend-sequential-full node scripts/qa/run_full_backend.mjs
```

The runner creates a fresh local database and uses one Jest invocation. Machine-readable results, command/environment summary and complete log are retained in `evidence/backend-sequential-full/`.

Earlier failed integration runs remain in evidence. The source corrections addressed actual transaction/pool misuse, append-only evidence cleanup in isolated tests, and changed payment-protection contracts. Tests were not disabled. Historical expiry fixtures now age the actual provider attempt, rather than aging only an order while leaving a brand-new payment in flight. Uncertain provider-order creation now has a durable UNKNOWN state and is not blindly retried. Coupon/quota assertions retain their business rules; independent pending checkouts use distinct stores or explicit historical fixtures. The hardening suite declares its product taxonomy so it also runs alone on an empty database.

Additional source changes after this checkpoint require fresh regression evidence. Hosted GitHub Actions status, real Clerk/FCM/Razorpay checks, Android builds and physical-device checks are separate verification requirements.
