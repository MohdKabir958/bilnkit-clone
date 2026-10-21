# Render port binding — 2026-10-21

The operator's uploaded Render log confirms successful migrations, including Clerk identity linkage. A subsequent start reports 22 migrations found and no pending migrations. It also contains an earlier port scan timeout and a later SIGTERM; neither proves the latest process is reachable. No schema reset or migration against a remote database was performed from this workspace.

The API now explicitly listens on IPv4 `0.0.0.0` using a validated numeric `PORT`, and logs that actual binding. Previously Node selected the wildcard address implicitly (locally observed as IPv6 `::`), and the startup message always said localhost. This change removes dependence on implicit IPv6/dual-stack behavior; the log alone does not establish the cause of Render's timeout.

## Local verification

- `cd backend && npm run build`: exit 0.
- `node --test scripts/qa/render_port_binding.test.mjs`: 2 passed, 0 failed, 0 skipped; exit 0; duration 1591.160979 ms.
- The compiled API returned HTTP 200 from `/health` through loopback and the container's non-loopback IPv4 interface. An unauthenticated admin request returned 401. An invalid PORT failed startup with a configuration error.
- Tests used `NODE_ENV=test`, disposable dummy configuration, an unused database address and a temporary working directory; no database or provider credentials were used.
- Remote `/ready` verification was blocked by this workspace's HTTP proxy (CONNECT 403). Hosted availability is unverified. No full backend suite is claimed for this binding change.

## Render Free operator steps

1. Deploy the latest feature branch commit with Docker Command `npm run start:render` (no extra shell quoting). It runs the existing controlled migration wrapper and starts the API only on success. No paid pre-deploy command is required.
2. Keep/set `PORT=10000` in Render Environment. The code also honors another valid Render-provided port. Save and deploy.
3. Confirm `No pending migrations to apply.` followed by `Backend Engine listening on http://0.0.0.0:10000`. Render must detect the port without a new timeout.
4. Open `https://grozo-backend-3wdf.onrender.com/health` and `/ready`. Expect HTTP 200, `status: online` and `ready: true`. Readiness is a connectivity check; migration success is established separately by the migration log.
5. Payments remain disabled and FCM remains unconfigured until their owned staging settings are supplied. Free instance local uploads are ephemeral; durable image storage still requires configured persistent/object storage.
