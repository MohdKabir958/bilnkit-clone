# Verification

The final backend run uses a fresh local PostgreSQL database, applies all migrations, and executes all Jest suites in one invocation. `QA_TEST_PATH` is unset. Production/Neon accounts and financial data are not used.

```sh
QA_EVIDENCE_DIR=Docs/admin-partner-onboarding/evidence/backend-full node scripts/qa/run_full_backend.mjs
```

**Final result: 1,138 passed, 0 failed, 0 skipped; 47 suites; exit 0. One invocation completed in 413.641 seconds (25 October 2026, 13:02:28–13:09:21 UTC), database `grozo_final_1792933335138_test` on 127.0.0.1. Backend source commit `aba7afb` remained unchanged throughout, verified against the source hash inventory. Node 24.19.0, PostgreSQL 17.11, Prisma 5.22.**

The complete result is recorded in `evidence/backend-full/backend-full-run-summary.json`, JSON results and the full log. `source-files.sha256` pins backend source, tests and migrations used throughout the invocation.

The initial targeted run had one test using an incorrect duty endpoint (404); it was corrected to exercise the existing `/api/drivers/duty-status` authorization check. The corrected targeted run passed all 26 tests. The initial complete run passed 1,137 of 1,138 tests: the new invitation-isolation assertion assumed the initial owner was still OWNER after an earlier concurrent-owner-demotion test. It now authenticates the actual remaining owner to create its invitation. Production authorization was not relaxed. The complete suite is rerun after the correction; targeted passes are not added to a full-run result.

Admin: **853 passed, 0 failed, 0 skipped in 55 files**, one full Vitest invocation. The production build passed with the existing Render HTTPS/Socket.io endpoint and Clerk public development key. New tests cover step gating, Back retention, explicit approval, server conflict recovery, city/zone filtering, final-only submission and new-store inventory navigation. Existing single-form assertions were updated to check the intentional first wizard step. Initial failed outputs are preserved separately.

Flutter source is unchanged since the welcome-page builds: customer **463 passed + 2 optional screenshot skips**, vendor **530 passed + 1 optional screenshot skip**, delivery **413 passed + 1 optional screenshot skip**; shared UI **22 passed**. All three apps and the shared UI package passed analysis. All enabled screenshot harnesses passed separately. The skipped tests are opt-in rendering captures, not functional checks. Raw results are in `../flutter-start-pages/evidence/`.

All three Android 1.12.0+19 profile ARM64 builds compiled and passed package ID, manifest callback, ZIP, signature, version and compiled Render URL verification. No Clerk Secret Key pattern was found. Development signing and Firebase-disabled staging status are explicit. Final application/package source trees equal the build source trees. Public HTTPS downloads returned 200 with exact byte counts and SHA-256 hashes; see `../flutter-start-pages/evidence/android/public-downloads.json`.

The browser captured 14 actual React onboarding/inventory screens (desktop 1440×1000 and mobile 390×844), with no reported horizontal overflow or uncaught exception. The workspace gallery separately contains 14 current actual React captures. All API/native fixtures are explicitly labelled. No hosted identity, real-device install, owned FCM delivery, outdoor GPS or real Razorpay provider operation is claimed.

Terminology guard and its three regression tests, authentication inventory check and whitespace checks pass. Existing inventory reservations, payment signatures, role/resource checks, sockets, finance and historical compatibility remain covered by the full backend suite.
