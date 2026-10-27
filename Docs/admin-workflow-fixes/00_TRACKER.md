# Grozo admin workflow fixes

Baseline: `dec347b0ad073bc608f45f395560126f8340480e`. Target: `feature/production-readiness`. Latest branch was fetched and fast-forward checked before implementation; newer work was retained. Sequential work, no agents. Exact instructions: REQUEST.md. No personal account was used, invited, provisioned, signed in or changed.

Source implementation is separate from release acceptance. **This is not a production-ready or deployed release: full backend, mobile runtime, staging and screenshot acceptance remain blocked.**

| Task | Source status | Review commit | Verification |
| --- | --- | --- | --- |
| 5 · Pickup-aware zones | Implemented, with Task 4 map preview | 0898c37 | Covering-city/radius filters, stale-zone form retention and closed drafts; UI tests pass. Real SQL concurrency regression pending |
| 6 · Rider eligibility/invitations | Implemented | f567bbc | Before-Review check, one-time expiring intended-identity link, manual/no-mail delivery, separate 409 and 429. UI tests pass; PostgreSQL/provider acceptance pending |
| 1 · Interactive Overview | Implemented | 93589ee | Real bounded city/date aggregates, IST days, separate captured/cash/pending money, accessible chart drills; UI and range unit tests pass. SQL aggregation pending |
| 2 · Vendor directory/details | Implemented | 8c02064 | Server totals/pagination/search/category/state filters, compact cards and 10 lazy sections, confirmed acknowledged open/close; UI tests pass. SQL authorization tests pending |
| 3 · Inline categories/customer visibility | Implemented | 4af4ef5 | Existing category form/service, retained store fields, primary/secondary usage deduplication, cache/rename/merge guards and Customer product matches. Admin tests pass; Flutter runtime/SQL pending |
| 4 · Search and confirmed map pin | Implemented | 6ab1aff | Authorized adapter, no invented default pin, optional manual fallback, actual coverage circles; moved-store closure/coverage review with active-order guard. UI tests pass; real map/provider/screenshots pending |
| 7 · Vendor catalog ownership | Implemented | 2d0938b | Admin oversight default, read-only stock inspection, explicit reasoned store/operator-scoped assistance and atomic success audit. UI tests pass; cross-app database acceptance pending |
| 8 · Integrated release verification | Partially verified; external/environment gates remain | Integration commit follows | Full Admin 886/886; focused backend 26/26; all Flutter analysis passes; Clerk build passes. Full backend, mobile tests/APKs, Chromium captures and real staging blocked |

Integration also retains selected-city approvals, exact bounded store-order intervals, lazy approved-store payout access and profile editing in one visible drawer at a time. Test assertions were revised for these intentional UI/contracts, without skipping tests or removing permission/financial checks. See 08_VERIFICATION.md and 09_STAGING_AND_ROLLBACK.md.
