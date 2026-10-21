# Database readiness diagnostics — 2026-10-21

The owner's Render screenshots show the process listening, but `https://grozo-backend-3wdf.onrender.com/ready` returns `{"ready":false}`. This is not a healthy database deployment. The existing readiness probe executes SELECT 1; disabled payments/FCM do not prevent that query.

Added a server-side diagnostic containing only a validated Prisma code, parsed database hostname and static operator hint. No raw error message, connection URL or password is logged. Identical repeated failures are logged at most once per minute; a successful check resets this interval. HTTP readiness remains 503/ready:false on failure. No authentication, finance, payment, notification or database configuration is changed.

Checks: TypeScript build exit 0; 7 diagnostic unit tests passed, 0 failed, 0 skipped, exit 0. They cover Prisma code/errorCode variants, credentials rejection, connection/TLS/timeout/URL errors and suppression of secrets in arbitrary errors/invalid URLs. The first test invocation stopped at the existing disposable-database environment guard; the final invocation uses a synthetic local *_test URL, with no database accessed by these pure unit tests. Complete final output and JSON are in `Docs/qa/readiness-diagnostic/`. A full backend regression is not claimed for this logging-only change.

Normal public GET attempts to /health and /ready could not connect from this workspace, so the screenshots are owner-provided evidence, not an independent hosted verification. No elevated network attempt was made in this change, no private connection setting was accessed and no live database was tested directly.

After deploying, request /ready and inspect Render logs for `Database readiness check failed`. P1000 means credentials rejected; P1001 host unreachable; P1002 connection timeout; P1011 TLS failure; P1013 invalid URL; P2024 pool timeout. UNKNOWN requires further server/engine investigation. Never replace the real probe with an unconditional success.

Set Render's Health Check Path to /ready. Successful API startup alone does not prove database readiness or migration completion. Review both runtime DATABASE_URL and the separate direct migration step against the same intended Neon database/branch.
