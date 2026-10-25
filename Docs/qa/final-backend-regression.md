# Final backend regression — 25 October 2026

Implementation source: `be665d1a71b91bc32c5935ee4108740db9bc1eba`.

**1,147 passed, 0 failed, 0 skipped; 47 suites; exit code 0.** One complete invocation took **403.594 seconds**.

Command from root: `QA_EVIDENCE_DIR=Docs/rider-registration-fix/evidence/backend-final node scripts/qa/run_full_backend.mjs`. The runner creates a fresh local PostgreSQL database, applies all migrations and invokes, once from backend: `node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/rider-registration-fix/evidence/backend-final/backend-full-run.json`.

Database `grozo_final_1792952198761_test`, host `127.0.0.1`, PostgreSQL 17.11; Node v24.19.0; Linux x64; UTC. Started 2026-10-25T18:16:55.060Z, finished 2026-10-25T18:23:38.697Z. No production database or financial data used.

[Complete log](backend-full-run.log), [machine-readable results](backend-full-run.json), [summary](backend-full-run-summary.json), [attempt history and all client/build checks](../rider-registration-fix/verification.md). Authentication and approval checks remain enforced; no failed functional test was disabled.

Clerk provider/native channels use explicit fixtures for local testing. Hosted authentication, deployed backend behavior, phone installation and real GPS/FCM remain separate operator/device checks.
