# Render Docker startup correction — 2026-10-21

The default Docker build selected the last stage, which was the one-off `migrate` target. Render consequently ran `npm run db:deploy` as its web process. It also ignored the direct migration URL because that command uses DATABASE_URL.

The final/default stage is now the non-root runtime. Its entrypoint is `node scripts/start-render.mjs`. The schema/scripts and pinned Prisma 5.22.0 CLI are included so Render's separate pre-deploy command, `node scripts/migrate-hosted.mjs`, can select MIGRATION_DATABASE_URL. The CLI moved from devDependencies to dependencies without changing its installed version. Explicit Compose runtime/migrate target names remain available. No migration is automatically added to API startup.

The migration wrapper reports the selected setting and host without logging the connection string/password. Invalid direct settings fail rather than falling back to the pooled runtime URL.

## Actual verification

- Backend TypeScript build: exit 0.
- `node --test scripts/qa/render_migration_config.test.mjs`: 4 passed, 0 failed, 0 skipped; exit 0. Child-process fixtures verify direct-URL precedence, fallback only when unset, malformed input, credential-safe diagnostics and child exit-code propagation. No external database contacted.
- Production pruning on an isolated copy of installed dependencies: `npm prune --omit=dev --offline --ignore-scripts --no-audit --no-fund`, exit 0. Removed 337 development packages; Prisma CLI 5.22.0, client 5.22.0 and Clerk Express 2.1.81 remain. The retained CLI's `--version` succeeds.
- Fresh Docker build: **not completed**. BuildKit selected the corrected runtime stage, but apt could not resolve the environment proxy. Complete build output is preserved. No compiler/security check was disabled to force a build.
- Public Neon DNS check: unavailable in the normal workspace for both the provided hostname and a control domain. Automatic approval review rejected an elevated DNS diagnostic because escalated network access is prohibited. No alternative elevated network route was attempted.
- No provided database password, Clerk secret, live data or cloud resource was used/modified. Neon reachability, remote migration and deployed readiness remain unverified.

Evidence: `Docs/qa/render-docker-fix/`. The earlier 1,093-test backend report remains evidence for its recorded backend commit; a new full Jest run is not claimed for this packaging-only correction.

## Operator steps

1. Copy both current connection URLs directly from the correct Neon database/branch: pooling ON for DATABASE_URL; OFF for MIGRATION_DATABASE_URL. Confirm the endpoint is active. If IP restrictions are enabled, allow the Render service's outbound IPs.
2. Select the updated feature branch commit. Clear a Docker Command override that runs `npm run db:deploy` or selects a migration-only image. Keep the default runtime entrypoint.
3. Configure pre-deploy `node scripts/migrate-hosted.mjs`, health check `/ready`, and all Clerk/storage variables from `Docs/clerk/07_neon_render_vercel_deployment.md`. Pre-deploy and persistent storage use the supported paid Render plan; no plan change was made here.
4. Deploy latest commit. A migration log must name MIGRATION_DATABASE_URL and the direct hostname. After successful migration, the API must keep running and /ready must return 200.

This code correction does not itself repair an incorrect hostname, a stopped endpoint or blocked networking. Use the next Render log to distinguish those from application startup configuration.
