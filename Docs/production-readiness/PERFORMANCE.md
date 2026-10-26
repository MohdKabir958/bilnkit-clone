# Controlled local pilot and pricing concurrency

These are measured local checks, not a production capacity claim. No live customer database or real payment provider was used.

## Pricing defect and correction

The baseline two-connection/one-second-pool-timeout pricing test failed in 8,136 ms. Successful catalog-edit responses were not previously asserted, allowing a failed edit to masquerade as a pricing race. Investigation found `getSettings()` acquiring a global Prisma connection from inside an interactive transaction while competing transactions held row locks. Reusing `getSettings(tx)` removed that second-connection dependency. Assertions now require successful HTTP edits, persisted prices, recalculated commission/customer totals and atomic pricing audits.

With the same constrained pool, the corrected test passed ten independent invocations. See `evidence/pricing/baseline-pool-two/` and `evidence/pricing/final-pool-two-integrated/`. The latter is a targeted repeat, so its filtered/skipped tests are not represented as full-suite success. The full backend checkpoint separately ran all 1,225 tests with zero skipped.

## Mixed pilot

Reproduce from the repository root after activating the repaired local environment:

```bash
QA_PILOT=true node scripts/qa/run_readiness_slice.mjs controlled-pilot-and-store-tools 5 1 test/e2e/vendor_store_tools.test.ts test/e2e/lifecycle_stress.test.ts
```

The runner creates a fresh local UTF8 PostgreSQL 17.11 database, applies all migrations, sets a five-connection pool with one-second acquisition timeout, and invokes Jest once. Node 24.19.0; Linux x64; four available CPUs. The app runs in the same process as Jest. Fixtures: six customers, three stores, five riders; ten deterministic waves, seed 20261002.

Concurrent actions include real HTTP browsing, optimistic inventory writes, checkout, simulated payment verification/callbacks, order changes, rider duty/location/claims, real Socket.io reconnect/room events, admin summaries, maintenance, notification intent/retry sweeps and settlement-job calls. Existing assertions continue checking financial/provider ledgers, role isolation, one winning rider, cancellation/refunds, event consistency and final order completion. Payment provider failures are deliberately simulated. FCM is unconfigured: sweeps exercise the source path, not delivery to a phone. The pilot also tests malformed/unauthorized requests, so business 4xx rejections are expected and counted separately from server errors.

Measured simulation (excluding Jest startup/other tests):

| Measurement | Result |
| --- | ---: |
| HTTP requests | 1,368 |
| Successful 2xx responses | 798 |
| Server 5xx responses | 0 |
| Elapsed time | 36,909.6 ms |
| Peak concurrent top-level actions | 40 |
| HTTP median / p95 / maximum | 76.2 / 363.7 / 1,067.7 ms |
| Largest response | 29,206 bytes |
| Jest-process RSS start / end | 767,619,072 / 873,697,280 bytes |
| Jest heap used start / end | 508,704,808 / 478,016,000 bytes |

The complete two-suite invocation passed 13 tests, zero failed/skipped, exit 0, in 56,714 ms. Machine-readable request aggregates/CPU/memory are in `evidence/performance/pilot.json`; full test evidence is in `evidence/slices/controlled-pilot-and-store-tools/`. Latency includes local authentication/application/database response work. It excludes internet RTT, a physical device, real Clerk round trips, external routing, FCM and Razorpay latency. Short-run memory movement does not establish absence of leaks.

## Scaling limits retained for operator planning

- The supported deployment is one API instance. Socket.io room broadcasts are process-local; multiple instances require a shared adapter and verified cross-instance room/session behavior before scaling.
- Job claims/fences live in PostgreSQL. There are bounded worker lanes/leases/attempts, not an unlimited local retry loop. Provider calls do not occupy locked database transactions.
- Product browsing and operator reports use bounded pages/ranges. Inventory batch availability is fetched in batches rather than per-card queries. Order/GPS/device events retain ownership checks; location history is pruned and measurements are validated.
- The admin production build still reports a 1.19 MB principal minified JS chunk (about 333 KB gzip). Route-level splitting is a remaining optimization candidate; no unsupported load-time improvement is claimed.
- Run a longer staging soak with the intended production data volume, owned provider configuration and traffic distribution before selecting a larger pool or instance count. This pilot is too small to establish every query's index plan or production concurrency ceiling. The pricing before/after result is the demonstrated optimization; there is no fabricated full-platform pre-change throughput baseline.
