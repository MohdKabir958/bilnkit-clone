# Final backend regression — Grozo marketplace and onboarding

**1,138 passed, 0 failed, 0 skipped, 47 suites. One complete Jest invocation. Exit code 0.**

Tested backend source commit: `aba7afb` on `feature/admin-partner-onboarding`, including the completed marketplace and welcome-page branches. Subsequent handover commits change documentation, screenshots and rendering tools only. Backend source, Prisma migrations and tests were checked unchanged throughout the run using `../admin-partner-onboarding/evidence/backend-full/source-files.sha256`.

```sh
# From repository root, with QA_TEST_PATH unset:
QA_EVIDENCE_DIR=Docs/admin-partner-onboarding/evidence/backend-full node scripts/qa/run_full_backend.mjs
# Actual invocation in backend:
node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/admin-partner-onboarding/evidence/backend-full/backend-full-run.json
```

The runner first creates a dedicated fresh local PostgreSQL database and applies all migrations with `node scripts/migrate.mjs`. It refuses remote hosts, uses UTF-8/template0/C.UTF-8 and keeps production/Neon untouched. Configure a private local backend/.env (or QA_DATABASE_URL) with a local PostgreSQL role allowed to create databases. Database credentials are excluded from evidence. Tests use deterministic fixtures, locally signed Clerk verification fixtures and local payment simulators, with real database transactions and server authorization enabled. Hosted provider authentication is not claimed.

| Field | Actual result |
| --- | --- |
| Database | grozo_final_1792933335138_test, 127.0.0.1 |
| Node / Prisma | 24.19.0 / 5.22.0 |
| PostgreSQL | 17.11, Debian x86_64 |
| OS | Linux x64 |
| Started | 2026-10-25T13:02:28.219Z |
| Finished | 2026-10-25T13:09:21.892Z |
| Duration | 413.641 seconds |
| Total / passed / failed / skipped | 1138 / 1138 / 0 / 0 |
| Jest invocations / suites | 1 / 47 |
| Exit code | 0 |

Full log: `backend-full-run.log`. Machine-readable test results and summary: `backend-full-run.json` and `backend-full-run-summary.json`. The original evidence files are also retained in `../admin-partner-onboarding/evidence/backend-full/`.

The initial complete onboarding run had one new test fixture failure after a concurrency test demoted an administrator: the invitation setup incorrectly assumed that identity was still OWNER. It now uses the actual remaining owner. No authorization check was weakened, test skipped or timeout increased. The failed run remains in `../admin-partner-onboarding/evidence/backend-initial-full/`. Initial targeted results remain separate; no test counts are assembled across runs. Earlier Clerk/RBAC/marketplace baselines remain in their own evidence directories.

See `../admin-partner-onboarding/verification.md` and `../flutter-start-pages/evidence/summary.json` for admin, Flutter, Android and screenshot verification and the outstanding physical-device/external-provider checks.
