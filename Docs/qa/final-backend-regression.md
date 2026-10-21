# Final backend regression — Clerk implementation

Date: 2026-10-21. Tested backend source commit: `1f6cbd4f82e1f3447ba6b4c133762c84c2b81c07` on `feature/india-grocery-platform`. Later handover changes concern documentation/evidence/deployment policy, not the tested backend implementation.

**One complete Jest invocation passed: 1093 passed, 0 failed, 0 skipped, 1093 total; 44 suites; exit 0.** Duration 374.467 seconds. No targeted reruns were added to these counts.

## Exact commands

Repository-root command (QA_TEST_PATH unset):

```sh
QA_EVIDENCE_DIR=Docs/clerk/evidence/backend-release node scripts/qa/run_full_backend.mjs
```

The runner executed in `backend`:

```sh
node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/clerk/evidence/backend-release/backend-full-run.json
```

It first applied all controlled migrations with `node scripts/migrate.mjs`. Existing Jest configuration retains `--runInBand` and its pre-existing forceExit behavior. No failed test was skipped or disabled; no timeout was increased.

## Isolated database and deterministic state

The runner reads a private local `backend/.env` or `QA_DATABASE_URL`, refuses remote database hosts, and creates a new database named `grozo_final_1792576066307_test` on `127.0.0.1`. It uses UTF-8, template0, C.UTF-8 collation/ctype, then applies the full migration chain including `20261021060000_clerk_identity`. It does not reset/reuse a demo or production database. The local role needs CREATE DATABASE permission; credentials are not recorded in evidence. On a fresh machine, create a private backend/.env from the example and point it to a local PostgreSQL role before running.

The test environment uses NODE_ENV=test, AUTH_MODE=legacy as the deterministic default; the Clerk suite explicitly selects clerk-test and restores environment/state afterward. Payment operations use the existing local provider simulator and synthetic HMAC fixtures. Clerk JWTs use locally generated RSA keys with the official verification SDK; only provider HTTP responses are substituted. No live customer, finance, payment or Clerk account was used. Authenticated business/resource checks remain enabled.

## Environment and timings

| Field | Actual value |
| --- | --- |
| Node | v24.19.0 |
| OS / CPU architecture | linux / x64 |
| PostgreSQL | PostgreSQL 17.11 (Debian 17.11-0+deb13u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |
| Prisma | 5.22.0 |
| Jest | 30.4.2 |
| Start UTC | 2026-10-21T09:47:56.983Z |
| Finish UTC | 2026-10-21T09:54:11.472Z |
| Execution duration | 374467 ms (Jest process; database setup precedes this interval) |
| Exit | 0 |

## Corrections and preserved failed evidence

The initial full attempt had a payment rotation failure: equal createdAt values did not have a deterministic SQL tie-breaker, and separately captured wall clocks could cross minute boundaries. Production reconciliation now orders by createdAt and ID. Its unchanged business assertions now force tied timestamps and advance a single captured clock by exactly one minute. The whole suite subsequently passed.

Final privacy review added address/support cleanup on Clerk deletion, durable provider-deletion intent in the same transaction as account deletion, and atomic owned-device invalidation. These are included in this final successful run, with explicit retry/outage assertions. A legitimate existing foreign-rider ownership contract hides resource existence with 404; the new Clerk fixture checks that same contract and unchanged assignment/state/OTP-attempt data.

A later intermediate run during competing Android builds timed out in the existing sequential 80-product inventory fixture setup, followed by a missing-product search assertion. No inventory assertion or timeout was changed. The final run used the same full suite without competing builds and passed. Complete failed logs/JSON remain under `Docs/clerk/evidence/backend-full/` (payment ordering) and `backend-handover/` (resource contention). `backend-final/` is an intermediate successful run, not the final acceptance result.

## Complete evidence and limits

- [Complete final log](backend-full-run.log)
- [Machine-readable Jest result](backend-full-run.json)
- [Exact runner summary](backend-full-run-summary.json)
- Canonical same-run files: `Docs/clerk/evidence/backend-release/`.

This verifies local backend regression with explicitly labelled provider fixtures. It does not prove hosted Clerk sign-in, real email/Google delivery, deployed Render/Neon/Vercel configuration, physical Android behavior, owned FCM delivery or real Razorpay sandbox operations. No production cutover is activated. See `Docs/clerk/08_testing_and_verification.md` and the manual test guide for those remaining checks.
