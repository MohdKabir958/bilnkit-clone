# Grozo Clerk implementation and handover

Start with [deployment instructions](07_neon_render_vercel_deployment.md), then [Android installation and manual checks](10_android_manual_test_guide.md).

The code supports isolated `clerk-test` mode across the backend, React admin and three Android applications. The default remains `legacy`; production cutover is **not activated**. Clerk mode never falls back to Grozo JWTs, Google exchange, partner passwords or the admin passcode. Final removal of legacy mode requires successful connected staging/device checks and explicit cutover approval.

The supplied APKs are development-signed ARM64 **authentication previews**. No backend is deployed. They can exercise the native Clerk screens against the configured development instance; grocery operations, admin approval, payments and FCM cannot be demonstrated with these previews. Provider login and real-device behavior remain unverified in this cloud environment. See the verification report for actual automated results.

The previously shared Clerk Secret Key must be rotated in the Clerk dashboard. Its replacement belongs only in secure backend environment settings. The mobile/public key is safe to distribute; no Secret Key was used or added to this implementation.

| Read | Purpose |
| --- | --- |
| [01 Architecture](01_architecture.md) | Inventory, trust boundaries and modes |
| [02 Dashboard](02_clerk_dashboard_setup.md) | Shared Clerk environment and Android callbacks |
| [03 Flutter](03_flutter_integration.md) | Official Android SDK bridge and reproducible builds |
| [04 Admin](04_admin_integration.md) | React SDK, protected shell, API and socket sessions |
| [05 Backend](05_backend_auth_and_roles.md) | Identity, authorization, webhooks, deletion |
| [06 Migration](06_migration_and_rollback.md) | Additive database migration, controlled linking, rollback |
| [07 Deployment](07_neon_render_vercel_deployment.md) | Exact Neon → Render → Vercel steps |
| [08 Verification](08_testing_and_verification.md) | Commands, results and limits |
| [09 Configuration](09_remaining_configuration.md) | Operator-owned work before connected testing |
| [10 Android guide](10_android_manual_test_guide.md) | Installation, troubleshooting and Pass/Fail sheet |

`migration-inventory.json` indexes authentication/authorization source references and route registrations. `changed-files.txt` lists changes from the implementation baseline. Evidence is under `evidence/`; test doubles are explicitly distinguished from hosted-provider checks.
