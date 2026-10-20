# Grozo Android phone previews

These are installable **ARM64 profile APKs signed with a development certificate**. They are provided to inspect the Grozo app startup/sign-in screens on a personal Android phone.

**Connected application testing is still pending.** These snapshots retain the development emulator API address (`http://10.0.2.2:5000/api`); it does not reach the cloud workspace from your phone. The hosted backend/database/admin have not been provisioned because their tools/credentials are unavailable in the running cloud session. Owned Google OAuth and Firebase configuration are also pending. These files do not establish working customer login, real notifications, orders or payments on a phone.

| App | Download |
|---|---|
| Customer | [Grozo-Customer-arm64-preview.apk](https://github.com/MohdKabir958/bilnkit-clone/raw/refs/heads/artifacts/grozo-android-preview/Grozo-Customer-arm64-preview.apk) |
| Vendor | [Grozo-Vendor-arm64-preview.apk](https://github.com/MohdKabir958/bilnkit-clone/raw/refs/heads/artifacts/grozo-android-preview/Grozo-Vendor-arm64-preview.apk) |
| Delivery | [Grozo-Delivery-arm64-preview.apk](https://github.com/MohdKabir958/bilnkit-clone/raw/refs/heads/artifacts/grozo-android-preview/Grozo-Delivery-arm64-preview.apk) |

Open the download in your phone browser, then open the downloaded APK. If Android asks, allow installation from that browser or file manager. For a signing/version conflict, use a matching signed update or remove an older preview first; uninstalling removes its local data. ARM64 builds need an ARM64-compatible Android phone. These are personal-test builds, not Play Store releases.

`SHA256SUMS.txt` records the exact file hashes. `manifest.json` records package labels, sizes and signer fingerprints. The original MIT notice is included in LICENSE; Flutter package notices are bundled in each APK. No private signing key or backend credential is included.

The application source is on [feature/india-grocery-platform](https://github.com/MohdKabir958/bilnkit-clone/tree/feature/india-grocery-platform), with the Grozo UI redesign from commit 64941d0. The [hosted deployment guide](https://github.com/MohdKabir958/bilnkit-clone/blob/feature/india-grocery-platform/Docs/11_hosted_deployment_and_apk_handover.md) describes how to build new phone previews with the real deployed HTTPS API address. That connected build will replace these UI-only snapshots after hosting and client configuration are available.

## Updated UI build — 20 October 2026

These files include the implemented Grozo redesign. Customer is 48.1 MB, Vendor 46.1 MB and Delivery 45.7 MB. Package IDs, APK ZIP integrity and development signatures were verified. Physical installation has not been tested in this cloud workspace.

For the authenticated screens, review the [actual screenshot gallery](https://github.com/MohdKabir958/bilnkit-clone/tree/feature/india-grocery-platform/Docs/ui-ux/client-demo) and [before/after PDF](https://github.com/MohdKabir958/bilnkit-clone/blob/feature/india-grocery-platform/Docs/ui-ux/client-demo/Grozo-before-after.pdf). Flutter images use explicitly isolated service fixtures; admin browser images use the local backend. These APKs contain no login bypass or embedded fake catalog.

If an older chat artifact says “could not download artifact”, use the direct APK links above. These files live on a Git branch and do not depend on expiring chat or Actions artifacts. If GitHub asks you to sign in, use an account with access to the repository. If a browser opens a file page, select Download raw file.
