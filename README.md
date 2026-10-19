# DailyMarket — Kraveo-based marketplace fork

This fork is being adapted into an India-wide multi-vendor grocery and delivery platform. It retains Kraveo's Node/Prisma backend, React operations website, three Flutter apps, Socket.io, FCM and Razorpay integrations. **The grocery conversion is under implementation; this is not a production-ready release.**

See [implementation progress](Docs/04_implementation_progress.md), [test evidence](Docs/05_test_cases.md) and [remaining work](Docs/10_remaining_work.md). Upstream readiness claims are not used as verification.

| Directory | Purpose |
|---|---|
| `backend/` | Express/TypeScript, Prisma/PostgreSQL, payments, dispatch and role authorization |
| `web/super_admin/` | Responsive operations website |
| `web/landing/` | Existing public landing pages, pending full rebranding/asset review |
| `apps/customer_app/` | Flutter customer app |
| `apps/vendor_app/` | Flutter vendor app |
| `apps/driver_app/` | Flutter delivery partner app |
| `packages/kraveo_ui/` | Shared Flutter design system and brand configuration |
| `branding/` | Central neutral identity, palette and Android application IDs |
| `Docs/` | Source audit, architecture, test evidence and operational documentation |

## Local development

Use Node 24.19.0, Flutter 3.44.9 and PostgreSQL 16+. See [setup guide](Docs/06_setup_guide.md) for cloud cache paths and platform requirements.

```bash
# Infrastructure only; database is loopback-only with disposable development authentication.
docker compose up -d postgres
node scripts/init_dev_env.mjs

cd backend
npm ci
npx prisma generate
npm run db:deploy
npm run build
npm run dev
```

The generated ignored `backend/.env` has unique local authentication secrets. Read it locally for admin login; never paste or commit it. Payments are explicitly disabled until real Razorpay TEST credentials are configured. Google sign-in and FCM require an owned project. Do not enable live transactions or deploy this local database configuration to production.

In `web/super_admin` and `web/landing`, run `npm ci`, `npm run build` and `npm run dev`. Admin uses port 3000; landing uses port 5173. API/socket settings are documented in the admin `.env.example`.

For each mobile role, `bash scripts/check_flutter.sh customer` (or `vendor` / `driver`) runs frozen dependency resolution, analysis, tests and a host bundle build. Android APK builds additionally require Android SDK/NDK, owned matching Firebase client configuration and proper signing. No real-device validation is implied by a bundle build.

## Database safety

The inherited migration history cannot initialize an empty database directly. Use `npm run db:deploy`, which bootstraps only empty public schemas using an audited schema snapshot and original migration checksums. Existing tracked databases use normal forward migrations. Existing untracked or partially failed databases require operator inspection, backup and explicit recovery; the script does not reset or silently baseline them. See [database design](Docs/03_database_design.md).

Backend tests delete records. Always use a separate database ending in `_test`; never use development/production data. Test-only providers/verifiers do not run in the normal API entrypoint.

## Rebranding

Edit `branding/brand.json`, run `python3 scripts/configure_brand.py`, then rebuild. Names, Android IDs/labels/icons/splash, shared palette, API service name and initial admin/mobile identity come from that configuration. Remaining inherited text/assets are listed in the audit. Register the generated IDs in your own Firebase/Google projects; upstream service configuration is not an entitlement to use those projects.

## License and attribution

Based on Kraveo by Kraveo Technologies / Tribal-Chief-001. The original [MIT license and copyright](LICENSE) are retained. Third-party notices, asset provenance and commercial terms require review; see [security and license audit](Docs/09_security_and_license_audit.md). No legal compliance or production security certification is claimed.
