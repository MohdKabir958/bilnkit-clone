# Final complete backend regression

Verified 21 October 2026 against the final implementation based on `be9611e`.

## Result: PASS — one complete invocation

| Field | Actual result |
| --- | --- |
| Test suites | 43 passed / 43 total |
| Total tests | 1064 |
| Passed | 1064 |
| Failed | 0 |
| Skipped / pending | 0 |
| Test-process duration | 354.484 seconds |
| Exit code | 0 |
| Started (UTC) | 2026-10-21T04:01:42.288Z |
| Finished (UTC) | 2026-10-21T04:07:36.799Z |
| Database | `grozo_final_1792555287726_test` on local PostgreSQL |
| Encoding / locale | UTF8 / C.UTF-8 |
| Node / platform | v24.19.0 / linux x64 |
| PostgreSQL | PostgreSQL 17.11 (Debian 17.11-0+deb13u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |

This is one all-green full Jest invocation, not an aggregate of reruns. All 43 matching suites were included. The extra six tests exercise the synthetic demo against the real services. No test was skipped or disabled.

## Reproduce

From the repository root, with existing backend dependencies installed and the local PostgreSQL service available:

```sh
node scripts/qa/run_full_backend.mjs
```

The runner reads local connection settings privately from `backend/.env` (or `QA_DATABASE_URL`), accepts only local PostgreSQL, creates a **new** `grozo_final_<timestamp>_test` database and serializes full runs with a private lock. It never drops/reuses the development, demo or production database. Tests run against the fresh migrated schema; normal fixture setup initializes their own data. Runtime JWT/admin/payment values are explicit test-only fixtures; FCM credentials are removed from the test environment.

Database creation for the successful run used:

```sql
CREATE DATABASE "grozo_final_1792555287726_test" WITH ENCODING 'UTF8'
  TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';
```

Migration prerequisite (backend working directory): `node scripts/migrate.mjs`. This checks historical migration hashes, applies the audited baseline only to an empty schema, records the inherited baseline migrations and deploys the remaining migrations. Full migration output is in the complete log.

The actual test process, with backend as its working directory:

```sh
node node_modules/jest/bin/jest.js --runInBand --json \
  --outputFile=/workspace/bilnkit-clone/Docs/qa/backend-full-run.json
```

Environment: `NODE_ENV=test`, `TZ=UTC`, the newly created test database and explicit local payment/HMAC fixtures. The committed runner supplies these settings without logging connection credentials. All tests use the existing simulator/test provider seams; no live gateway payment was made.

## Initial failures and corrections

The initial complete attempt finished with 1,062 passes and two failures. Its raw log/results are preserved separately.

1. The local PostgreSQL cluster's default template uses SQL_ASCII. The inherited category migration's Unicode test demonstrated that inheriting this encoding corrupts multi-byte whitespace processing. Both the regression and demo database creators now explicitly use UTF-8/template0/C.UTF-8. Query evidence confirms the initial SQL_ASCII database and successful UTF8 database. No historical migration SQL or checksum was changed.
2. The twenty-request delivery-code race test identified the single successful transition by the old human success sentence (`verified successfully`). Doorstep terminology changed that sentence to `Delivery verification code accepted. Order delivered.` The assertion now matches this exact new sentence. It still requires one winning transition, permits only the existing success/conflict statuses, verifies the remaining successful responses are idempotent already-delivered responses, and retains delivered/used-code database checks. No order-transition or locking logic changed.

The initial runner also printed a stale hardcoded PostgreSQL 16 label. The final runner queries the server version and correctly reports PostgreSQL 17.11; [environment.json](environment.json) and [database-encoding-verification.json](database-encoding-verification.json) record the actual server.

After these corrections, the entire suite ran again from a fresh database in one invocation and passed. This report uses only that final run's totals.

## Evidence

- [Complete stdout/stderr and migration log](backend-full-run.log)
- [Full per-test Jest JSON](backend-full-run.json)
- [Final summary and exit code](backend-full-run-summary.json)
- [Actual environment](environment.json)
- [Database encoding queries](database-encoding-verification.json)
- [Initial failed-attempt log](backend-initial-attempt.log) and [initial per-test JSON](backend-initial-attempt.json)
- [Application verification](final-app-verification.md)
