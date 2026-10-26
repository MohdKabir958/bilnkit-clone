# Grozo cloud environment repair — 26 October 2026

The current development environment has been repaired and its complete setup script replayed successfully. This does not mean the ongoing application migration has passed its complete regression.

Changed only local environment state during the repair:

- Reclaimed about 6 GB from six ignored Android build-intermediate/test-cache directories and 48 inactive disposable local QA databases. Source, lockfiles, APK outputs, demo/development databases, and the latest two databases per QA family were preserved.
- Added a common shell activation file at `/workspace/.setup/grozo-env.sh` for PostgreSQL, Flutter, Java, Android tools and writable npm/Pub/Gradle/analyzer caches.
- Added idempotent PostgreSQL startup at `/workspace/.setup/start-grozo-postgres.sh`.
- Initialized Android adb's required `/home/agent/.android` directory using narrowly scoped filesystem permission. HOME was not changed.
- Saved the complete install script and startup instructions in the cloud environment draft. Draft save succeeded; publication has not been performed.

Verified, sequentially:

1. Node 24.19.0/npm 11.9.0; PostgreSQL 17.11; Flutter 3.44.9/Dart 3.12.2; JDK 21; adb 37.0.1.
2. Full setup replay: frozen npm installs, local migrations, backend/admin/landing builds, frozen dependency resolution for the three Flutter apps, branding check, adb version. Exit 0.
3. Fresh local development database, backend build/startup/readiness, existing local admin authentication and database-backed partner/geography/inventory/public catalog smoke. Exit 0. See `backend-runtime.json` and `backend-runtime.log`.
4. Customer Flutter deployment-contract and payment-readiness widget smoke: four passed, zero failed. See `customer-smoke.log`.
5. adb server start, device-list request and shutdown. No connected physical device was present.

Activation:

```bash
source /workspace/.setup/grozo-env.sh
/workspace/.setup/start-grozo-postgres.sh
```

Run one heavy check at a time. Use fresh local UTF8 databases ending `_test` for destructive tests. Keep at least 3 GB free before an Android build. Do not reset development or production data to fix a failing test.

The last complete application regression preceding repair had 1,197 passed and 26 failed tests. Those failures concern changed checkout contracts and application integration, rather than missing dependencies. They remain separate work; targeted passing results are not a substitute for a clean complete run. No live Clerk, Razorpay, FCM or physical-device success is asserted here. Final APKs have not been rebuilt or released by this repair.

Replaying setup succeeded in this running machine. Fresh-task restoration and publication remain unverified.
