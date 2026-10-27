# Verification and remaining release gates

No personal account was used. All identity fixtures are synthetic. Existing hosted services, auth modes, database and financial records were untouched. Original production-readiness work remains in place; these eight follow-up tasks have their own tracker.

## Passing checks

- Full admin suite in **one final invocation: 886 passed, 0 failed, 0 skipped; 67 files; exit 0; 25.62 seconds**. Exact command and machine summary are in evidence/verification-summary.json; complete log admin-full-final.log and JSON admin-full-final.json are retained. Earlier 15 failures were old UI expectations: payout details moved into lazy tabs, server counts replaced partial-page counts, category active state became configurable on create, and old shortcut labels changed. Assertions now exercise the actual new workflows; no tests were disabled.
- Clerk-mode `npm run build`: hosted-auth/CSP configuration check, TypeScript and Vite pass. Public test client settings only; no Clerk secret or hosted sign-in is required for the build. See admin-build-final.txt. Bundle-size warning remains; map/Leaflet is lazy and shared.
- Focused backend: **26 passed, 0 failed, 0 skipped; 4 suites; exit 0**. Covers range bounds, maps adapter, readiness and safe diagnostics; backend-focused.json/log. This is explicitly not the full backend regression.
- Customer, Vendor and Delivery `flutter analyze --no-pub`: no issues found. See customer-analysis.txt, vendor-analysis.txt and driver-analysis.txt.
- Terminology guard and its 3 self-tests pass. The exact STUDENT enum allowance in riderOnboarding is an internal PostgreSQL/customer-role compatibility value, not UI copy. No forbidden display wording was allowlisted.
- Brand configuration and git whitespace checks pass.

## Blocked checks, without claimed success

Prisma generation's child process receives sandbox EPERM and can exit without generating. The cached client lacks RiderInvitation. Backend TypeScript reports that missing delegate; it is not a passing build. Regenerate before compiling in an enabled environment. PostgreSQL local networking is blocked and its narrowly scoped escalation was declined; no alternate route around that restriction was used. Full backend/HTTP/Socket.io/SQL concurrency tests therefore remain unverified. Even the complete unit-directory invocation includes a local HTTP listener and aborted with listen EPERM; no result count is claimed for it. New real database regressions cover overview, directory, category visibility, confirmed pickups, rider invitation and catalog assistance; existing grocery/COD/refund/ownership suites remain enabled in CI.

Flutter tester failed before test execution because it could not bind 127.0.0.1:0 (EPERM). A customer ARM64 profile APK attempt, 1.16.1+25, failed before compilation in Gradle FileLockContentionHandler: no usable wildcard IP. This common prerequisite also blocks the remaining Android builds. No new APK was published. Files already present in build/clerk-test-apks belong to the earlier release and must not be relabelled as this source.

Chromium exited 133 before rendering: crashpad setsockopt Operation not permitted. No new screenshots or comparison PDF were generated. Reproducible current-component fixture harness is prepared in scripts/ui_ux/admin-workflow; it is not a staging authentication test and has not been browser-verified in this environment. Existing galleries remain historical.

Actual Render/Vercel SHAs remain unverified: baseline public API/config was 404, readiness 200, admin HTML 200; those prove reachability only. Hosting-control credentials and an explicitly approved isolated staging deployment with synthetic Clerk identities were not supplied. The existing public admin URL is not evidence of an isolated acceptance environment. No real provider, device, mail, FCM, payment or cross-app hosted success is claimed.

## Reproduce in an enabled environment

1. Use local PostgreSQL only, source the repository setup, regenerate Prisma, then run `node scripts/qa/run_full_backend.mjs` once from the root. The runner creates a fresh local UTF-8 _test database, applies migrations, uses only local payment simulation and preserves the complete log/JSON. Do not supply a production URL.
2. Run the exact full admin command in verification-summary.json, then the Clerk-mode build with the public configuration matching the environment.
3. Run `bash scripts/check_flutter.sh customer`, then vendor and driver. Existing CI runs all analysis/tests/bundles; no checks are skipped. Build Android previews through the maintained Clerk test APK script after mobile source is committed; verify embedded endpoints, signing and SHA-256 before publishing.
4. For genuine fixture screenshots, start `node scripts/ui_ux/admin-workflow/server.mjs`, then `node scripts/ui_ux/admin-workflow/capture.mjs` on a machine permitting local browser/socket processes. Captures are explicitly marked synthetic fixtures, not hosted or physical-device sessions. Review browser errors and overflow before accepting the gallery.
5. Complete the isolated staging checklist in 09_STAGING_AND_ROLLBACK.md before any release claim. Obtain explicit approval before hosted changes.
