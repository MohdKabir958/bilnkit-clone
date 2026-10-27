# Grozo admin workflow fixes

Baseline: dec347b0ad073bc608f45f395560126f8340480e. Branch: feature/production-readiness. Existing newer work and fe8b9be are preserved. Sequential work, no agents. Exact instructions: REQUEST.md. No personal account was used, invited, provisioned, signed in or changed.

Tasks 1–7 are implemented and automatically verified. Task 8 is partially accepted: complete automated CI, Android builds/publication and genuine local UI captures pass; **real staging/provider/physical-device acceptance is still pending**. This is not a production deployment or production-ready certification.

| Task | Source status | Review commit | Verification |
| --- | --- | --- | --- |
| 5 · Pickup-aware zones | Implemented | 0898c37 | UI plus real SQL center/boundary/outside/wrong/inactive/no-zone/concurrent stale validation; closed drafts and retained form errors |
| 6 · Rider eligibility/invitations | Implemented | f567bbc | Pre-Review verified identity, intended-account expiring manual link, 409 vs actual 429; SQL/API guards pass; genuine provider acceptance pending |
| 1 · Interactive Overview | Implemented | 93589ee | Real bounded city/IST dates, captured/received/pending money, filtered chart drills; SQL aggregation and UI pass; real browser component visuals captured |
| 2 · Vendor directory/details | Implemented | 8c02064 | Compact server-paginated counts/filtering, ten lazy tabs, safe payout fields and acknowledged controls; SQL/UI pass |
| 3 · Inline categories/customer visibility | Implemented | 4af4ef5 | Existing inline service, primary/secondary usage and cache guards; public SQL and customer Flutter regression pass |
| 4 · Search/confirmed pin | Implemented; external maps configuration pending | 6ab1aff | Authorized adapter/manual fallback, actual Leaflet pin/circles, audited closure/review on move; SQL/UI pass; real provider/device check pending |
| 7 · Vendor catalog ownership | Implemented | 2d0938b | Oversight default/read-only inspection, explicit expiring store/operator assistance and atomic audit; SQL role/scope and UI pass |
| 8 · Integrated release verification | Automated checks passed; external acceptance pending | cba6e5c verified application/test source | Complete Backend 1266/1266; Admin 886/886; all three Flutter analysis/tests/bundles; three built/published/download-verified APKs; 13 genuine fixture captures and 15-page PDF |

Integration commits 3ef4316/8668d44/e5c87b1/cba6e5c retain city/range drill context, lazy protected payouts, one visible details editor and truthful CI diagnostics; fixture corrections preserve all business/append-only guards. No tests/security checks disabled.

Exact commands, environment, CI links and limitations: [08_VERIFICATION.md](08_VERIFICATION.md). APK downloads/checksums, screenshots/PDF and change summary: [10_HANDOVER.md](10_HANDOVER.md). Hosted staging/rollback: [09_STAGING_AND_ROLLBACK.md](09_STAGING_AND_ROLLBACK.md). File inventory: [modified-files.txt](modified-files.txt). Earlier 26-task historical results remain in the production-readiness tracker and are not relabelled as this release.
