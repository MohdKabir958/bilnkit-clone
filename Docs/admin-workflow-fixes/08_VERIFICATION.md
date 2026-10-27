# Verification and remaining acceptance gates

No personal account was used. All test identities/data are synthetic. Hosted services, authentication modes, databases and financial records were untouched. Earlier 26-task work is preserved; this eight-task follow-up has separate acceptance.

## Final automated results

[Complete successful CI run](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40453636470), source **cba6e5cba8b8bc917ec9f6a6bf646426aebd8e85**. Backend, Admin, landing and all three Flutter jobs succeeded. Accessible full job metadata, check annotations and artifact metadata are saved in evidence/ci-final-*.json and ci-backend-final-annotations.json.

| Check | Actual result |
| --- | --- |
| Complete backend, one invocation | **1266 passed, 0 failed, 0 skipped; exit 0** |
| Backend prerequisites | Fresh PostgreSQL service, all 29 migrations, generated Prisma and TypeScript build pass |
| Pricing concurrency | 10 successful repetitions, connection_limit=2/pool_timeout=1 |
| Complete Admin, one local invocation | **886 passed, 0 failed, 0 skipped; 67 files; exit 0; 25.62 seconds** |
| Admin CI and Clerk-mode build | Pass, including TypeScript/Vite, CSP configuration and production dependency audit |
| Customer/Vendor/Delivery CI | All analysis, complete tests and asset bundles pass; no invented test counts |
| Android previews | All three ARM64 APKs compile; signature/package/version/embedded API checks pass |
| Public APK distribution | All three HTTP 200 downloads match SHA-256 and exact byte counts |
| Browser visuals | 13 actual component captures; zero uncaught errors and horizontal overflow; 15-page PDF |
| Terminology/brand/whitespace | Pass; internal STUDENT compatibility identifier is explicitly allowed, not UI wording |

Backend full-suite shell step: **2026-10-27T05:09:39Z → 2026-10-27T05:15:25Z, 346 seconds**. This is GitHub's measured whole-step duration, not an invented Jest-duration statistic. The detailed Jest output/JSON and ten concurrency results are retained in the [complete backend artifact](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40453636470/artifacts/12711776905). CI artifact expiry is recorded in evidence/ci-final-artifacts.json. The workspace proxy blocks the artifact/log redirect host: local annotations/metadata are direct API evidence, not a reconstructed full log. Download the complete artifact through GitHub for the raw files.

## Exact backend setup and invocation

Runner: ubuntu-latest Linux x86_64, Node 24.19.0, dedicated ephemeral postgres:16-bookworm container. Test-only connection: postgresql://postgres:postgres@127.0.0.1:5432/market_test; NODE_ENV=test. No production URL, credentials or provider calls. Clerk-specific suites use signed synthetic identities/provider transports and enforce authorization; they are not hosted Clerk verification. Existing cross-app COD, ownership, dispatch, delivery-code, finance/refund/payment-signature, FCM ownership and Socket.io regressions remain enabled.

From backend/:

```sh
npm ci
npx prisma generate
npm run db:deploy
npm run build
mkdir -p ../Docs/production-readiness/evidence/ci
set -o pipefail
npm test -- --json --outputFile=../Docs/production-readiness/evidence/ci/backend.json 2>&1 | tee ../Docs/production-readiness/evidence/ci/backend.log
```

The package test command expands to jest --runInBand: the whole suite runs once. The fresh service and existing guarded fixture resets provide deterministic state. New real SQL/HTTP regressions cover authoritative center/boundary/outside/stale coverage; directory fields/totals/authorization; primary-category public visibility; confirmed pickup updates; intended-identity expiring invitations/409/real 429; assistance audit/scope; and receipt aggregation without join multiplication. Existing order/COD/finance/role tests were not disabled.

After that complete pass, CI also runs:

```sh
node ../scripts/qa/run_pricing_concurrency.mjs ci-pool-two 2 10 --testNamePattern='recalculate and edits running together'
npm audit --omit=dev
```

The pricing runner creates its own disposable local _test database, applies migrations and retains each repetition's log/JSON. Its name-filtered repetitions are additional focused checks, not the complete regression count.

## Admin, Flutter, APK and capture evidence

Exact local Admin command, durations and counts are in evidence/verification-summary.json; complete admin-full-final.log/json are committed. Local focused backend: 26/26, four suites, is retained separately and is not combined into the 1266 result. All three local Flutter analyses passed. CI uses bash scripts/check_flutter.sh ROLE (locked dependencies, analysis, complete tests, bundle). No tests were skipped to obtain the clean full-suite result.

All three 1.16.1+25 APKs were built through the maintained scripts/clerk/build_test_apks.py with the supplied Render origin, public Clerk configuration and development signing. Mobile build source is 8668d448a29ad3f60b3b2a521eee8b4913ac9afc; mobile source is unchanged through the verified cba6e5cba8b8bc917ec9f6a6bf646426aebd8e85 commit. Android ARM64 split versionCode is 2025; min SDK 24. APK URLs/checksums/signatures/build logs and limitations are in 10_HANDOVER.md and evidence/apks. Firebase is not configured in these previews. Hosted compatibility and physical-device success are not claimed.

The 13 new captures are genuine local Chromium renders of implemented components with explicit synthetic API fixtures. Captures and comparison PDF are in screenshots/README.md and client-review.pdf; the maintained harness and PDF builder reproduce them. No generated fake UI images. Authorized basemap/geocoding, hosted/browser authentication and device flows remain separate checks.

## Failures corrected and limitations resolved

Earlier runs are retained rather than presented as passing. Run 40452042359 had 1264/1266 assertions pass: invalid newly added COD/category fixtures were corrected without relaxing constraints. Run 40452748189 had all 1266 assertions pass but failed append-only ledger cleanup; the new fixture now reuses the existing guarded disposable-database reset and closes connections in finally. The subsequent complete invocation above is clean. See evidence/ci-fixture-corrections.md and the failed-run annotations.

Initial Prisma/Chromium/Gradle restrictions were resolved by narrowly approved build/browser operations; compilation, actual captures and APK publication now pass. Automatic approval review rejected local PostgreSQL startup because it was previously declined. It was not retried or bypassed: full database verification uses the existing authorized CI service container instead.

## Still required externally

Task 8's **real staging acceptance remains incomplete**: actual Render/Vercel Git SHAs are unverified; no explicitly approved isolated staging deployment, synthetic verified provider identities or management credentials were provided. Public reachability is not source alignment or isolation. Existing hosted branches/domains/auth modes/data were not modified.

Still pending: approved matching staging deployment/migrations; authorized map service/basemap and real address searches; intended-account hosted Clerk invitation/session/refresh/logout; owned Firebase files and real device-token isolation/push; Android physical GPS/navigation/background/OTP/account-switch; genuine provider test-mode online payment/refund checks; browser-to-staging full cross-app workflow with redacted request/response evidence. The supplied personal account is prohibited for all such work. See 09_STAGING_AND_ROLLBACK.md for exact cases and rollback.
