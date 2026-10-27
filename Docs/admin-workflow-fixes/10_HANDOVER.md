# Admin workflow handover — 27 October 2026

Implementation branch: feature/production-readiness. Previous production-readiness work and fe8b9be are preserved. Each of the seven feature tasks has a separate reviewable commit; source, tests and original request are indexed in 00_TRACKER.md. No personal account was used. No hosted deployment, database, authentication mode or financial record was changed.

## What changed and how to use it

- **Overview:** choose city and Today/7/30/90 days. Compact counts, receipts and charts open the matching filtered order/store/rider view. Captured online funds, platform-received cash and outstanding rider cash are distinct. Empty data stays zero.
- **Vendors:** search and filter a compact paginated directory; open a store to inspect its ten detail sections. Secondary edits and acknowledged Open/Close controls live in details. Payout data loads only when needed and allowed.
- **Add vendor:** create/select a store category inline, choose the real pickup address/pin, confirm it and review eligible delivery zones. Outside/stale zones cannot pass the backend check. A closed draft without coverage is allowed; it cannot take orders. Store ownership still needs a genuine verified partner and approval.
- **Pickup changes:** search/select/adjust and confirm the pin. Coverage circles use the actual backend radius math. Moving an operational store is audited, blocks during active orders and closes/pauses coverage for review. No default coordinates are silently submitted.
- **Delivery partners:** Invite rider and Review applications are separate. A manual expiring link verifies the intended Clerk identity; it does not send email or grant approval. Add Rider checks verified identity before Review. Unverified identity gives an email-field 409; actual throttling gives 429/Retry-After. Linking/approval remain explicit and new riders start OFFLINE.
- **Catalog oversight:** Admin normally reviews/moderates and inspects stock. Approved vendors own their everyday products, prices, stock, batches/expiry and hours. Exceptional admin assistance requires a store, reason, confirmation and expiring actor-scoped audit reference.

## Download the three latest APKs

1.16.1+25, ARM64/API 24+, development-signed profile previews; Android split-ABI versionCode **2025**. All three APKs were downloaded from GitHub again: HTTP 200, exact byte counts and SHA-256 matches. Verification, package/signature metadata and build logs are in evidence/apks and evidence/*-apk-build-final.log.

| App | Direct download | SHA-256 |
| --- | --- | --- |
| Customer | [APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/4ee38fe3ca01a1617c8f3a7c71775f75fde993fb/clerk-staging/1.16.1-25/Grozo-Customer-Clerk-Test.apk) | `690f90649f763df706c978c3d77c8bbf7928e452d599cb9314d0e25bfdade52f` |
| Vendor | [APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/4ee38fe3ca01a1617c8f3a7c71775f75fde993fb/clerk-staging/1.16.1-25/Grozo-Vendor-Clerk-Test.apk) | `0a980d2e733fa959720de629c57b338071be6457b7fc89c051e1300e6d4f8685` |
| Driver | [APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/4ee38fe3ca01a1617c8f3a7c71775f75fde993fb/clerk-staging/1.16.1-25/Grozo-Delivery-Clerk-Test.apk) | `87161693929c1124ce7baf2e17404b782cafc91692c3d7d1a8ba073072858fba` |

Compiled REST URL: `https://grozo-backend-3wdf.onrender.com/api`; Socket.io origin: `https://grozo-backend-3wdf.onrender.com`. Build/mobile source: **8668d448a29ad3f60b3b2a521eee8b4913ac9afc**; later commits correct backend test fixtures and document/capture the same mobile implementation. These apps target the supplied hosted backend, whose deployed Git SHA is not independently verified here. New server features need an explicitly approved matching deployment. Firebase is unconfigured in these previews; existing FCM source remains intact. These are not Play Store production releases.

## Screenshots and PDF

- [15-page before/after and screen review PDF](client-review.pdf)
- [13-screen clickable gallery](screenshots/README.md)
- [Capture conditions and error/overflow manifest](screenshots/manifest.json)

These are actual implemented React components rendered in local Chromium with explicitly synthetic API fixtures. They are not hosted or device captures. Two PDF before pages use the preserved historical marketplace gallery. Map pin/circle geometry renders, but the basemap/provider remains unconfigured; that limitation is displayed on the screen.

## Verification and remaining external acceptance

Current exact test results/CI and environment evidence: [08_VERIFICATION.md](08_VERIFICATION.md). Complete backend: **1266 passed, 0 failed/skipped; exit 0**, one invocation, followed by ten successful constrained-pool pricing repetitions. [Successful CI](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/40453636470), verified source `cba6e5cba8b8bc917ec9f6a6bf646426aebd8e85`. Full Admin: **886 passed, zero failed/skipped**. All three Flutter CI analysis/test/bundle jobs pass, and all three Android APKs compile and verify.

Source completion does not satisfy Task 8's genuine staging gate. Still required: explicitly approved isolated Render/Vercel/Neon deployment at matching SHAs; synthetic verified Clerk identities and consenting test mailboxes; licensed/authorized geocoder/tile configuration; owned Firebase configuration; real Android GPS/FCM/session/callback tests; real provider test-mode payments/refunds; operator walkthrough. The supplied public admin URL and a personal account are not an isolated test environment. Manual invitations do not claim email delivery. No paid resources were created.

Automatic approval review rejected local PostgreSQL startup because it had previously been declined. That action was not retried or bypassed; complete database regression runs on the existing authorized CI service container. CI retains full logs/JSON in downloadable artifacts. The workspace proxy blocks the artifact/log redirect host, so local evidence includes the accessible GitHub check annotations/job metadata and links to complete artifacts; no full log is fabricated from partial outputs.

Deployment/migration/rollback instructions and genuine cross-app staging cases: [09_STAGING_AND_ROLLBACK.md](09_STAGING_AND_ROLLBACK.md). Modified file inventory: [modified-files.txt](modified-files.txt). The PDF, gallery README and all 13 PNG downloads were also checked: HTTP 200 and matching SHA-256 (evidence/gallery-download-verification.json). Backend/web/apps/packages trees match the successful cba6e5c CI checkpoint exactly; evidence/application-source-equivalence.json records the comparison. A source push is not a production deployment or authentication cutover.
