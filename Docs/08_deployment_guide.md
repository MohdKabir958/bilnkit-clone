# Deployment status and safety

No production deployment, real payment activation or paid infrastructure action has been performed. This branch is a development baseline under implementation, not a production release.

Required before a pilot: finish all phase gates; real serviceability and inventory; owned Firebase/Google/Razorpay sandbox configuration; Android testing and signing; operator-reviewed licenses/assets; location privacy fixes; secure hosting/HTTPS/WSS and explicit CORS; database backups with tested restores; durable uploads; observability/alerts; customer support; restore/restart rehearsal.

Backend release commands once validated: install frozen dependencies, generate Prisma client, back up database, run `npm run db:deploy`, build TypeScript and run `npm start` behind a reviewed reverse proxy. Supply unique JWT/admin/payout keys securely and full gateway settings. `PAYMENT_PROVIDER=disabled` is rejected outside development. Never include server credentials in Vite or Dart configuration. Configure API/socket base URLs per environment.

Database deployment: use the fresh bootstrap only for empty schemas. Existing installations require a backup, migration ledger/schema inspection and rehearsal on a restored copy. Historical failed migrations require explicit operator recovery. Do not reset production data. Keep old application artifacts and use additive schema changes so code rollback can occur independently; rehearse before operating a pilot.

Flutter APKs require Android SDK, matching Firebase configuration for the generated identities and release signing. The inherited Gradle release configuration uses a debug signing key and is NOT approved for distribution; release-signing hardening remains required. `scripts/build_mobile_apks.sh` gives role/version-specific filenames but does not establish production signing or device correctness.

Compose is loopback-only local PostgreSQL with trust auth. Do not deploy that configuration to a public host. CI configuration and monitoring/backup automation are still outstanding unless verification records explicitly say otherwise.
