# Corrections from complete backend CI

CI run 40452042359, commit 8668d44, executed one full Jest invocation: 1266 total, 1264 passed, 2 failed, 0 skipped. All new rider, directory, pickup and assistance regressions passed; the two failing newly added fixtures were invalid before their intended assertions.

- Overview COD rows omitted workflowVersion and defaulted to v1. PostgreSQL correctly enforced Order_paymentMethod_check (COD requires v2 and no group). The fixture now creates v2 store orders, with an actual open/uncollected third COD order. Captured/received/outstanding assertions remain exact; delivered/active counts are additionally checked. No database constraint or runtime validation changed.
- The category fixture enabled only store purpose, then tried disabling that sole purpose. The existing 400 both-purposes-disabled validation correctly ran first. The fixture now enables both purposes so the intended store-in-use guard is exercised. Its expected 409 remains and CATEGORY_IN_USE/forRestaurants assertions were added. No test is skipped and no permission or category rule is relaxed.

The complete suite is rerun after these corrections; this failed result is retained and must not be described as passing.

Run 40452748189 at e5c87b1 executed all 1266 assertions successfully (0 failed/skipped), but exited 1 because the new overview afterAll attempted DELETE against the append-only CashLedgerEvent table. This is a failed suite, not a clean pass. Cleanup now reuses the existing cleanTestOrders harness, which refuses any non-test/non-_test database and resets disposable test tables without weakening production triggers. Server/database connections close in finally. All business assertions and append-only guards remain enabled. The entire suite is run again.
