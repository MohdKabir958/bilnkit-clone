# 3. Flutter and official native Android integration

The community `clerk_flutter` package was evaluated and is not used. These Android-first apps use the official `com.clerk:clerk-android-ui:1.2.1` SDK through a shared Kotlin MethodChannel bridge. Flutter 3.44.9/Dart 3.12.2, Java 21, Kotlin 2.3.20, Compose and Android tooling are recorded with build evidence. Android minimum SDK is at least 24. iOS Clerk integration is outside this Android handover.

Shared native source is `packages/grozo_clerk/android/src/main/kotlin/com/grozo/clerk/`. Each app attaches the bridge in MainActivity and configures the public key/mode through manifest placeholders. `AuthView` owns credentials, verification, password recovery and browser OAuth. No Flutter password collector, embedded credential WebView or custom Grozo JWT is used in Clerk mode.

The official SDK owns encrypted session persistence. Dart receives session state and requests fresh SDK tokens for API calls and socket reconnects; it never writes Clerk tokens into the old secure-token store. Epoch checks discard in-flight tokens after account changes/logout. Local logout clears SDK state even if remote revocation cannot be confirmed, and reports that limitation honestly. Connected Grozo logout also invokes backend-owned device/duty cleanup and remote revocation.

| App | Clerk business behavior |
| --- | --- |
| Customer | Restore verified Grozo profile; existing profile/address/cart flow remains; successful deletion clears native session |
| Vendor | Sign in, verify Grozo access, or explicitly submit a new pending store application; no store is claimed by email/phone |
| Delivery | Sign in, verify access, or apply pending/offline; rider approval, assignments, GPS and delivery codes remain server-authorized |

Build from the repository root, after Flutter dependencies are installed:

```sh
python3 scripts/clerk/build_test_apks.py --app customer
python3 scripts/clerk/build_test_apks.py --app vendor
python3 scripts/clerk/build_test_apks.py --app driver
```

The script reads only the public `Docs/clerk/android-preview-public.json`, injects native `GROZO_AUTH_MODE=clerk-test`, sets Dart `AUTH_MODE=clerk-test`, and builds development-signed profile ARM64 APKs version `1.10.0+16`. It explicitly omits unowned Firebase configuration. No Secret Key is needed. Toolchain/cache environment paths are machine-specific; use your installed Flutter/JDK/Android SDK.

Without `--backend-origin`, `AUTH_PREVIEW=true` and a reserved `.invalid` API origin make the missing backend explicit. Business screens are not mounted. After deployment, rebuild each app with `--backend-origin https://YOUR-RENDER-HOST`; this disables preview mode and uses the real HTTPS API/Socket origin. Never use `10.0.2.2` on a physical phone.

Owned production release signing and Firebase client files remain required for release builds. Preview signing must not be used for Play Store publication. Existing FCM code remains; notification delivery cannot be verified in previews without owned Firebase configuration.

Manual provider/device checks are mandatory: verification, recovery, Google return if enabled, persisted sessions, renewal, logout, account switching, offline behavior and callbacks. Automated MethodChannel fixtures and native compilation do not establish any of those hosted-provider results.

Android split-per-ABI packaging adds its ARM64 offset to the Flutter build number: base build `16` produces actual manifest `versionCode=2016`, with `versionName=1.10.0`. The verification manifest records both values.
