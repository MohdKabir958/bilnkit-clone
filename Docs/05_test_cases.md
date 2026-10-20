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

## Phase 2 verification

- Backend: 11 suites, 301 tests passed (the original core selection plus India serviceability and maps adapters). An additional focused late-capture regression passed after adding a deterministic case; the earlier 301 includes the concurrent late-payment race.
- Two-city acceptance: actual admin-created vendor accounts in Bengaluru and Delhi, password login, persisted addresses, enabled circles/coverage, correct discovery, server fees, unsupported/foreign-address rejection, zone/city disablement, immutable snapshots and a payment-simulator → vendor → rider → OTP → delivered lifecycle. Test payments are not external gateway verification.
- Admin: 46 files, 798 tests passed, including coverage UI and real API URL/auth request shape tests.
- Customer: full suite 434 tests passed; profile/address/catalog/checkout flows and retries retained; obsolete campus-only expectations replaced with structured-address requirements. Analysis passed without issues. Vendor India-coordinate validation analysis passed.
- API runtime smoke passed health, authorization, real admin login and database-backed partner/geography/enabled-city/catalog reads.
- Android debug APK attempts exposed and fixed a Kotlin branding import, then required a full JDK rather than the installed JRE. APK compilation continues separately; no APK/device or release-signing success is claimed here. No iOS runner exists in the inherited checkout.

## Phase 3 verification

- Core backend: 12 suites, 316 tests passed before final focused fee/MRP checks. Includes full single-order lifecycle, authentication, hardening, payment adversaries, two-city geography and the initial 14 grocery cases.
- Additional split-checkout regression: 5 suites, 91 tests passed after updating old campus/flat-fee expectations to saved addresses and per-store zone fees. Coverage includes group creation, idempotency, payment/refund, rider claims, per-stop pickup, atomic OTP delivery and finance counting. The run exposed and fixed quote extra-fee display values that disagreed with zone charges.
- Integer-payment follow-up: all 9 amount-integrity tests passed, including 600 randomized carts and the complete paise-sensitive payment/refund case, after removing floating point subtotal/coupon calculations.
- Admin: 47 files, 804 tests passed; new UI cases verify stock request versions/idempotency, exact selling-price/MRP/tax conversion and moderation.
- Flutter analyses: all three clean. Full suites: customer 436, vendor 517, rider 394 passed. Vendor retry testing exposed and fixed a dialog controller disposed during its closing animation. Historical outside-campus cases now enforce India bounds instead.
- Android debug APKs built for all three roles using the explicit debug Firebase bypass. These are unsigned-for-distribution debug artifacts; FCM, Google sign-in, gateway, device and release-signing behavior remain unverified.
- Fresh database bootstrap applied all baseline and new migrations successfully; Prisma schema drift comparison reported no difference. Runtime API smoke also passed authenticated inventory reads.

The grocery acceptance suite creates two vendors through admin APIs, signs each in through the real partner endpoint, and creates 50/30 products through their own authenticated SKU APIs. It verifies persistence/pagination, store isolation, server totals, stock reservations, exact replay, duplicate-line aggregation, last-pack concurrency, versioned adjustments, expiry/cancellation release, split rollback, delivered stock consumption, pickup loss, MRP bounds and immutable snapshots. Test payment providers remain explicitly simulated.

Final focused grocery suite: **16 passed**, including different zone-price quote/charge consistency and the database MRP constraint through both admin HTTP and a direct database write.


## Phase 4 verification (2026-10-20)

All results below are local execution, using real PostgreSQL and real HTTP/Socket.io. External authentication/payment/FCM doubles are confined to automated tests; normal startup has payments disabled and no fabricated service credentials.

| Check | Result / command |
|---|---|
| Customer full suite | `flutter test`: 441 passed |
| Vendor full suite | `flutter test --no-pub`: 519 passed after store-profile completion |
| Rider full suite | `flutter test`: 396 passed |
| Admin full suite | `npm test -- --run`: 48 files, 807 passed |
| Flutter static checks | `flutter analyze --no-pub` in each role: no issues |
| Android debug builds | `flutter build apk --debug --no-pub` in each role: all built. Explicit debug-only Firebase bypass; no real device or release-signing claim. Native package IDs verified with aapt2. |
| Backend/admin/landing builds | `npm run build`: all passed after frozen installs |
| Dependency production audits | `npm audit --omit=dev --json`: zero reported vulnerabilities for backend, admin and landing |
| Migration history / bootstrap | All 15 historical SHA-256 entries unchanged. Fresh UTF-8 `npm run db:deploy` applied all 21 migrations; repeat no-op; Prisma drift: `No difference detected.` |
| Populated backup/restore | Custom-format dump restored into NEW empty UTF-8 `_restore_test` target: 9 users, 2 vendors, 80 products, 21 migrations. Original databases preserved. |
| Local API smoke | `npm run smoke:runtime`: health, admin denial/login and authenticated partner/geography/inventory plus public vendor/enabled-city reads passed |
| Local websites | Admin/landing HTTP and transformed modules, privacy route passed; component tests do not constitute a physical-browser/device journey |
| Deployment checks | Runtime Docker image built; local read-only container `/ready` passed with UID1000, healthcheck healthy. Production Compose config validated using temporary example values, then removed. Public DNS/Caddy TLS and production deployment unverified. |
| Reusable cloud setup | Complete frozen-install/migration/build/pub-resolution script replay passed; install/start instructions saved in cloud draft. Saving does not publish or prove new-task/local-commit restoration. |

Final backend gate: **42 suites, 1058 tests passed** on a fresh UTF-8 database, using `DATABASE_URL=postgresql://agent@127.0.0.1:5432/market_release_test npm test -- --silent`. Exact results are in `evidence/phase4-results.txt`. Diagnostic full runs exposed obsolete campus/shared-pool contracts and test data assumptions; tests now enforce saved-address authority, private offers and active-only GPS. The seeded stress run found an actual order/offer deadlock; consistent row-lock ordering repaired it. Disabled push batches now defer together, reducing database writes and connection pressure. Fee regression tests verify zone bases plus checkout-wide free/small-order policies, exact split quotes/charges and immutable stored charges.

Acceptance coverage: `grocery_inventory` creates 50/30 SKUs through isolated vendor accounts and covers last-pack races/reservations/release; `india_serviceability` covers two distinct Indian cities and unsupported/foreign addresses; `lifecycle_journeys` and group suites cover real persisted payment/vendor/dispatch/pickup/tracking/OTP/refund transitions using simulated external providers; `delivery_operations` covers private territory offers, declines/timeouts/escalation/retry, spoofing/terminal privacy, outbox restart/token ownership/refresh, requester support/reopen, usable vendor upload URLs, real city metrics/audit; `structured_logging` verifies diagnostic redaction. Existing adversarial auth/payment/isolation/finance suites remain in the full backend gate.

Store-profile completion: real backend tests verify approved owner isolation, invalid-field rollback, duplicate names, no commission disclosure, coverage invalidation and idempotent audit. Flutter tests verify authenticated profile load/save and confirmation/offline retry for address changes. The full vendor suite and its debug APK are rerun after this UI addition; final totals below supersede the earlier 517-test vendor run.

`transaction_settings.test.ts` starts an isolated Prisma singleton with `connection_limit=1` and `pool_timeout=1`, opens a real transaction and reads settings successfully on that connection. Before the repair, the global settings read needed a second connection and could stall checkout until timeout. Focused pool/settings/catalog/grocery verification: 3 suites, 61 passed.

Final complete backend result:

```text
Test Suites: 42 passed, 42 total
Tests:       1058 passed, 1058 total
Snapshots:   0 total
Time:        439.984 s
```


## Grozo branding verification

The Grozo rename/logo update passed all **3,221 tests** again: backend 42 suites/1,058 tests, admin 48 files/807 tests, customer 441, vendor 519 and rider 396. All three Flutter analyses were clean. Backend/admin/landing builds passed. Three Android debug APKs were rebuilt with the explicit debug-only Firebase bypass; APK metadata confirms `in.grozo.customer` / `.vendor` / `.driver`, correct role labels and packaged logo/adaptive-launcher/splash/notification resources. Browser checks confirmed loaded Grozo artwork and no horizontal overflow on desktop admin/landing and a 390px landing viewport. See `evidence/grozo-branding-results.txt` for artifact hashes and scope. Release signing and owned Firebase/device verification remain separate launch gates.
