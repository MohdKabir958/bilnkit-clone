# Complete backend regression — 26 October 2026

Latest backend implementation commit: `ca886b496dfac2ecb351882d5451e692a0c6035a`, retaining verified checkpoint `fe8b9be`. All migrations applied to a new isolated local UTF8 PostgreSQL database `grozo_final_1793022095441_test`; no production access or reused test state. All **27** migrations succeeded. Backend TypeScript build passed.

From the repository root:

```bash
source /workspace/.setup/grozo-env.sh
/workspace/.setup/start-grozo-postgres.sh
QA_EVIDENCE_DIR=Docs/production-readiness/evidence/release-final node scripts/qa/run_full_backend.mjs
```

The wrapper creates the disposable `_test` database and invokes the complete suite exactly once:

```text
node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/production-readiness/evidence/release-final/backend-full-run.json
```

| Result | Actual value |
| --- | ---: |
| Total tests | 1238 |
| Passed | 1238 |
| Failed | 0 |
| Skipped | 0 |
| Suites | 57 |
| Duration | 524240 ms |
| Exit code | 0 |

Started `2026-10-26T13:41:45.367Z`; finished `2026-10-26T13:50:29.667Z`. Node v24.19.0; PostgreSQL 17.11 (Debian 17.11-0+deb13u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit; Linux x64. Payment transport is an explicit local simulator; Clerk-auth regression fixtures do not establish real hosted Clerk sessions. FCM credentials are absent; notification tests inject transport responses and verify durable state/ownership. Real PostgreSQL, HTTP and Socket.io behavior are exercised by lifecycle suites. No tests were disabled or loosened to obtain this result.

Full combined migration/test log: [backend-full-run.log](backend-full-run.log). Original release log, machine-readable Jest results and setup summary: [release-final evidence](../production-readiness/evidence/release-final/). Earlier failed diagnostic runs and the independent 1,233-test checkpoint are retained separately.
