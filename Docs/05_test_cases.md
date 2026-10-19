# Tests and observed outcomes

Evidence is for this local instance. CI and fresh cloud task restoration have not been run.

| Check | Actual outcome |
|---|---|
| `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` in all three Node components | Passed; frozen lockfiles used for installation. |
| `npm run build` in backend | Passed after Prisma generation. |
| `npm run build` in both web apps | Passed. Admin warns about large chunks. |
| `npm test` in admin after CSV test repair and initial branding | 45 files, 790 tests passed. |
| `npm audit --omit=dev --json` in backend after transitive updates | Zero reported vulnerabilities. This does not establish absence of vulnerabilities. |
| Same production audit in admin | Zero reported vulnerabilities. |
| Fresh `npm run db:deploy`, repeat deploy, Prisma drift comparison | Passed, repeat no-op, no drift. |
| Backend normal development startup, `/health`, `/api/vendors` | Passed; real database returned an empty catalog. Payments disabled, no Google/FCM credentials. |
| `docker compose config --quiet` | Passed. Compose service itself was not started; actual PostgreSQL is the cloud-local installation. |
| `python3 scripts/configure_brand.py --check` | Passed; generated configuration is current. |
| `node scripts/init_dev_env.mjs` twice | First created ignored local config; second preserved it. No secrets printed. |
| Initial backend full-suite attempts (not the final baseline selection) | Interrupted during diagnosis after finding test environment assumptions. These are not passing full-suite runs. |
| Corrected backend baseline suite | 9 suites, 280 tests passed. Includes full lifecycle/security cases and unit checks. |
| Flutter analysis, customer/vendor/rider | All three passed with no issues. |
| Flutter customer tests | 433 passed. |
| Flutter vendor tests | 514 passed. |
| Flutter rider tests | 394 passed after fixing neutral-wordmark width on small screens. |
| Flutter bundles | Customer/rider default Android-target bundles passed; vendor Android-target failed because native-asset hooks need Android SDK, then vendor linux-x64 host bundle passed. These are not APK/device checks. |
| Real Android device, Google sign-in, Razorpay sandbox, FCM sends | Not executed; credentials/devices required. |

Core lifecycle target: real PostgreSQL and HTTP/Socket.io, injected test-only payment provider and Google verifier. `test/e2e/lifecycle_journeys.test.ts` exercises payment, vendor acceptance, rider claim, pickup, OTP, delivery, cancellation/refunds, concurrency and role-specific events. `auth_pipeline.test.ts`, `hardening.test.ts`, `payments_adversarial.test.ts` exercise authentication, permissions, throttling and signatures. Normal API runs never inject those test doubles.

Tests delete records. `DATABASE_URL` must identify a disposable database with a name ending `_test`; Jest refuses other names. Phase 2-4 acceptance scenarios (multi-city discovery, inventory races, grocery variants, dispatch offers) are not passed by these baseline tests and require new tests with the implementation.
