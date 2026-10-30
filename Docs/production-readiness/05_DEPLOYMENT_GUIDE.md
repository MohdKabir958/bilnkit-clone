# Deployment steps

1. Choose a separate staging Neon branch/database; retain production records. Copy its pooled runtime URL into Render `DATABASE_URL` and direct TLS URL into `MIGRATION_DATABASE_URL`.
2. Keep the currently approved authentication mode. For Clerk staging, configure one matching test Clerk application, exact authorized admin origin without a trailing slash, verified webhook secret, server-only secret key and explicit approved administrator. Use `Docs/clerk/02_clerk_dashboard_setup.md` and its environment templates. Do not automatically cut production over.
3. Review cost before applying `render.yaml`: its supported Starter instance/persistent disk are paid. Free staging can run the existing `npm run start:render` Docker command, but its local uploaded files are ephemeral and it is not a production storage solution.
4. Enter actual backend/admin origins and separate writable public/private storage paths; genuine Razorpay/FCM settings only where configured. Build, apply controlled migrations and start using the commands in `DEPLOYMENT_AND_RECOVERY.md`. Never disable payment signature verification or fabricate gateway keys to make startup succeed.
5. Verify `/health`, schema/storage-aware `/ready`, safe `/api/config`, an approved profile and a denied wrong-role request. Configure exact CORS origins. Perform an isolated hosted backup/restore drill before live rollout.
6. On Vercel import `web/super_admin`, Vite, build `npm run build`, output `dist`. Enter its public API/auth/publishable settings, generate/check exact-origin CSP, redeploy and verify route refresh/sign-in/RBAC/socket reconnect. Do not put server secrets in `VITE_*` variables.
7. Install the matched staging APKs, then use `07_ANDROID_TEST_GUIDE.md`. Real phone/provider checks are not replaced by local fixtures. Confirm the deployed source/configuration matches the clients before judging an authorization error.

The detailed variable sources, persistent directory layout, migration commands, manual cutover boundaries and recovery commands are in [DEPLOYMENT_AND_RECOVERY.md](DEPLOYMENT_AND_RECOVERY.md). No paid resource or production deployment was created during implementation.
