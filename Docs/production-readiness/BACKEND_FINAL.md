# Latest complete backend verification

The continuation completed a **single complete run: 1,238 passed, zero failed/skipped, 57 suites, 524,240 ms, exit 0**, after all 27 migrations in a fresh local database. Backend source: `ca886b4`. Exact command, database/environment and full unmodified log are in [Docs/qa/final-backend-regression.md](../qa/final-backend-regression.md) and [release evidence](evidence/release-final/).

The earlier checkpoint below is preserved as independent history, not added to the latest test count.

# Complete backend regression — 26 October 2026

The final backend source completed one clean Jest invocation against a fresh isolated local PostgreSQL database. No failed test was disabled or skipped. Real Clerk/FCM/Razorpay-hosted execution and production deployment are separate external checks, not inferred from simulated fixtures.

| Result | Value |
| --- | --- |
| Total / passed | 1233 / 1233 |
| Failed / skipped | 0 / 0 |
| Suites | 56 |
| Duration | 496958 ms (8m 17s) |
| Exit code | 0 |
| Node | v24.19.0 |
| Platform | linux / x64 |
| PostgreSQL | PostgreSQL 17.11 (Debian 17.11-0+deb13u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |
| Database | `grozo_final_1793015366472_test`, local `127.0.0.1` |
| Start / finish UTC | 2026-10-26T11:49:39.221Z / 2026-10-26T11:57:56.217Z |

Reproduce from the repository root:

```bash
source /workspace/.setup/grozo-env.sh
QA_EVIDENCE_DIR=Docs/production-readiness/evidence/backend-final node scripts/qa/run_full_backend.mjs
```

The runner accepts only local PostgreSQL, creates a new UTF8 database ending `_test` from `template0`, applies all 26 migrations using the direct local URL, and starts from deterministic per-suite fixtures. Authentication is exercised by legacy fixtures and separately by Clerk verification/role-isolation fixtures. Payment-provider and push transports are explicit simulators; no live customer accounts or money are used. Test cleanup refuses non-test databases.

Exact Jest command:

```text
node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/production-readiness/evidence/backend-final/backend-full-run.json
```

Complete log: `evidence/backend-final/backend-full-run.log`. Machine-readable Jest results and summary: `backend-full-run.json` and `backend-full-run-summary.json` alongside this document; immutable final-run copies also reside under `Docs/production-readiness/evidence/backend-final/`.

The earlier 1,225-test checkpoint and earlier failed diagnostic runs remain under `Docs/production-readiness/evidence/`. They are historical evidence, not combined to manufacture this result. Corrections include using the existing transaction connection for settings, guarded test cleanup for append-only cash evidence, proper aging of payment-attempt fixtures, protected overlapping-checkout contracts, initialized fixture taxonomy, physical missing-stock disposition, partial-refund submission recovery and independent GPS exception approval. New tests cover the revised behavior; existing assertions were not removed to force a green run.

CI workflow source runs the full suite and repeated constrained-pool pricing checks and uploads logs even after failure. Hosted GitHub Actions status is not asserted: API inspection was Forbidden in this environment.
