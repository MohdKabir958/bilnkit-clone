# Final backend regression — 25 October 2026

Source implementation: `c5d8636c02deedbd67cc1fb7fe0411cc0db8eff8`.

**1,142 tests passed; zero failures, zero skipped; 47 suites; exit code 0.** One complete invocation took **387.984 seconds**.

Command: `QA_EVIDENCE_DIR=Docs/vendor-registration-fix/evidence/backend-final node scripts/qa/run_full_backend.mjs`. This creates a fresh isolated local PostgreSQL database, applies all migrations, then runs `node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/vendor-registration-fix/evidence/backend-final/backend-full-run.json` from `backend`.

Database: `grozo_final_1792949425395_test`, host `127.0.0.1`, PostgreSQL 17.11. Node v24.19.0, Linux x64, UTC. Started 2026-10-25T17:30:36.556Z, completed 2026-10-25T17:37:04.588Z. No live database was read or changed.

Complete log: [backend-full-run.log](backend-full-run.log). [Machine-readable Jest results](../vendor-registration-fix/evidence/backend-final/backend-full-run.json), [runner summary](../vendor-registration-fix/evidence/backend-final/backend-full-run-summary.json), [all commands and attempt history](../vendor-registration-fix/verification.md).

Real Clerk provider login, Android device installation and hosted Render behavior remain external checks, distinct from the official verifier/native-channel fixtures used in local regression. No authorization check or failing functional test was disabled.
