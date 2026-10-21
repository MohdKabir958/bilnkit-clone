# Clerk migration: stage 1, blocked before cutover

**Clerk authentication is not enabled. Grozo still uses its existing authentication.**

The requested mobile feasibility gate has not passed. The public Clerk development endpoint is blocked by this workspace's network proxy (CONNECT 403), and no Android device is available for the required lifecycle checks. No authenticated Clerk request was made and the supplied secret was not used or saved.

Completed work:

- Audited the existing authentication, authorization, identity relationships and test consumers. The reproducible [inventory](migration-inventory.json) contains 200 referenced files, 161 Express endpoint registrations and 20 middleware/router registrations. These include protected business routes that must retain their authorization, not just files to delete.
- Reviewed checksum-verified published Flutter beta and official Android SDK sources.
- Implemented a compile-only Kotlin MethodChannel session probe against `com.clerk:clerk-android-api:1.2.1`. It compiled in all three existing Android projects without editing their sources or changing their application IDs.
- Added read-only review tooling, safety tests, configuration worksheets and the migration design below.

The Flutter beta defaults persist credentials as plain JSON and use an embedded WebView for Google authentication. Those defaults were rejected. The official Android SDK is the preferred candidate: its source uses Android Keystore/AES-GCM and does not fall back to plaintext credential storage when encryption is unavailable. Compilation alone does not establish secure real-device behavior.

The nine numbered documents distinguish **current code**, **proposed implementation**, and **unverified work**. They are not a claim that the migration is complete. Database migrations, Clerk REST/socket verification, client cutover, legacy removal, hosted deployment, and final migration regressions have not been performed. This follows the request's explicit stop condition before destructive authentication removal.

Start with [architecture](01_architecture.md), [mobile findings](03_flutter_integration.md), [actual verification](08_testing_and_verification.md), and [remaining configuration](09_remaining_configuration.md).

The [changed-file list](changed-files.txt) covers this stage's tooling, evidence and documentation. No backend, Prisma, Flutter application, admin runtime or deployment configuration was cut over.
