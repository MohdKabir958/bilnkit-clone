# Admin redesign verification

Implementation commits: `126cd4621d013efd0c1040fa1b1ef7c31ebaac53` and `7196a8335cd16f89e4ebecebba7a636ae8c48917` (directory deletion/privacy hardening). Verified locally on 2026-10-21. The implementation adds an additive database directory and owner/admin permissions, email activation, audited revocation, vendor creation, city order filtering and UI workflows. No cloud database, paid resource, production payment or live user account was changed from this workspace.

## Complete backend regression — one invocation

From repository root:

```sh
QA_EVIDENCE_DIR=Docs/admin-redesign/evidence/backend-full node scripts/qa/run_full_backend.mjs
```

The runner only accepts localhost PostgreSQL and creates a fresh UTF-8 disposable database. It applies the controlled baseline and all 23 migrations before starting one Jest invocation:

```sh
node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/admin-redesign/evidence/backend-full/backend-full-run.json
```

| Evidence | Result |
| --- | --- |
| Database | `grozo_final_1792597122895_test` at `127.0.0.1` |
| State | Newly created empty database; audited baseline and migrations; deterministic local payment simulator |
| Tests | 1119 total; **1119 passed**, 0 failed, 0 skipped |
| Suites | 46 |
| Jest invocations | 1 |
| Elapsed runner measurement | 396.569 seconds |
| Exit code | **0** |
| Start / finish | 2026-10-21T15:38:58.935Z / 2026-10-21T15:45:35.535Z |
| Runtime | v24.19.0, Linux x64 |
| PostgreSQL | PostgreSQL 17.11 (Debian 17.11-0+deb13u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit |

[Complete log](evidence/backend-full/backend-full-run.log), [machine-readable Jest result](evidence/backend-full/backend-full-run.json), [runner summary](evidence/backend-full/backend-full-run-summary.json).

The initial complete attempt had 1,114 passes and one failure; it is retained in `evidence/backend-full-initial`. The failure was an obsolete `/verified successfully/` response-text assertion in a concurrent delivery test. The actual existing route returns `Delivery verification code accepted. Order delivered.`. The corrected test still demands exactly one successful response with DELIVERED data and that exact current message; the wrong-code attempt ceiling and locked-state alternative remain unchanged. Delivery production code was not changed to satisfy the test. The final complete suite above passes after that correction.

The existing Clerk test now verifies that an established database grant survives removing the bootstrap allowlist entry. That is the intended new contract, not removal of an authorization assertion. New tests separately prove that ordinary customers and Administrators cannot manage team access and that revocation denies REST/private sockets.

Final review also corrected the new write rate rules to use the existing path normalizer’s unversioned paths, verified real HTTP 429 responses for normal/case/trailing-slash variants, and rechecked partner roles under the identity lock to reject stale customer snapshots. All 19 targeted admin-access tests passed before the final complete invocation. Intermediate invocations were deliberately stopped during final review; none are counted as passing full runs.

## Admin, builds and guards

From `web/super_admin`:

```sh
npm test -- --reporter=default --reporter=json --outputFile=../../Docs/admin-redesign/evidence/admin-tests.json
```

**839 passed, 0 failed, 0 skipped; 52 test files; exit 0.** Console duration: 51.14 seconds. [Complete log](evidence/admin-tests-final.log), [machine-readable results](evidence/admin-tests.json).

Backend `npm run build`: exit 0. [Build log](evidence/backend-build.log).

Admin `npm run build` with `VITE_AUTH_MODE=clerk-test`, the current public Clerk instance key, and both API/socket origins set to `https://grozo-backend-3wdf.onrender.com`: exit 0, including the CSP/configuration guard, TypeScript and Vite. [Build log](evidence/admin-build.log). The existing large-bundle warning remains; it is not a build failure.

`python3 scripts/qa/check_ui_terminology.py`: pass. New exact allowances cover only the existing internal STUDENT role enum and dish upload-purpose API identifier. No legacy display copy was added. `python3 scripts/qa/test_terminology_guard.py`: 3 passes. Authentication source inventory regenerated and checked. Diff whitespace check passes.

No Flutter source, Android build configuration or package ID changed, so Flutter/device builds were not rerun for this admin/backend update.

## New security and workflow coverage

- Explicit first-owner bootstrap; ordinary or forged role/metadata claims cannot invite.
- Pending normalized email grants; duplicate conflict; provider-unverified email cannot activate access even with a forged email claim.
- Verified provider ownership activates only the invited role; no matching historical email/UUID takeover.
- Existing partner identities cannot be repurposed as administrators, including stale snapshots during role changes.
- Verified Clerk deletion and in-app deletion anonymize directory contact fields, revoke the grant and preserve audit/identity tombstones.
- Real versioned/case/trailing-slash HTTP write requests enforce rate limits.
- Owner-only team endpoints and transaction-level owner recheck; revocation audit and private socket disconnection.
- Final-owner protection, including concurrent demotions, without disabling authorization tests.
- Valid city/pickup/zone checks for new stores; initially closed stores; no generated credentials; verified optional owner assignment preserving UUIDs.
- Server-enforced city order query and pagination, plus frontend city requests and stale-city-response protection.
- Clerk workspace requests execute with an SDK session even when legacy JWT storage is empty.
- Actual Add vendor form, email grant form, confirmation/error/recovery, product creation in exact paise, zero-stock initialization and accessible focused city steps.
- Existing Razorpay signature/idempotency, finance, stock, delivery OTP, FCM ownership and auth regressions remain in the complete backend suite.

## Browser evidence and limits

See [the screenshot gallery](screenshots/index.html), [capture descriptions](screenshots/README.md) and [manifest](screenshots/manifest.json). Captures show actual implemented React components at desktop and narrow mobile viewports with explicitly labelled synthetic API fixtures. The capture harness is a standalone localhost-only entry outside the production entrypoint. It does not bypass production login.

The actual Clerk SDK is used for the login capture, but this workspace's proxy blocks its hosted origin. Its expected load failure and the implemented recovery screen are recorded. Hosted Clerk login/activation, hosted CORS and Socket.io reconnection, Render migration rollout, image-upload durability and physical-device checks still require verification on the owner's deployed services. No mocked test is presented as proof of Clerk-hosted authentication. Render Free local uploads remain ephemeral; use durable owned HTTPS object-storage URLs or an explicitly authorized persistent-disk plan.
