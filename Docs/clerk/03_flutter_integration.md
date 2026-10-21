# 3. Flutter feasibility and Android integration

Status: **candidate compiles; real authentication and lifecycle remain unverified**. Existing app login flows are unchanged.

## Published Flutter SDK review

Reviewed published `clerk_flutter` and `clerk_auth` **0.0.18-beta**, verifying archive SHA-256 against Pub metadata. They require Dart >=3.6.2 / Flutter >=3.27.4, compatible with the installed Flutter 3.44.9/Dart 3.12 toolchain. Upstream identifies these packages as community-maintained and not officially supported by Clerk.

The default persistor writes `clerk_sdk.json` as plain JSON. The token cache persists the client token through that interface. The Google flow uses an embedded WebView with a custom user agent. These defaults do not meet this migration's requirements. Extension points exist for custom persistence/auth flows, so this is not a claim that every possible use of the beta is insecure. Grozo has not adopted the beta.

Exact archive URLs, hashes, file paths and line references are in [mobile-feasibility.json](evidence/mobile-feasibility.json). Re-run:

```bash
# Set CLERK_PUBLISHABLE_KEY privately to the development PUBLIC key first.
python3 scripts/clerk/mobile_feasibility.py --output Docs/clerk/evidence
```

Exit **2** means the acceptance gate remains uncleared. This read-only tool does not accept/use the Secret Key, create accounts, request sessions or assert that sign-in works.

## Official Android candidate

Reviewed checksum-verified published `com.clerk:clerk-android-api:1.2.1` source. It uses Android Keystore/AES-GCM for persisted credentials, rejects storage when encryption is unavailable, and exposes SDK-owned token refresh and sign-out APIs. Real-device behavior still needs testing.

`scripts/clerk/native/ClerkSessionProbe.kt` is a compile-only MethodChannel experiment with initialize/session/token/sign-out calls. It has no sign-in UI, application registration, credentials, custom persistence or JWT issuer. It returns generic errors, distinguishes timeouts from lifecycle cancellation, and does not report failed sign-out as success. Its host would need a main-thread lifecycle scope and to cancel it on detachment. **It is not a completed or release-ready authentication bridge.**

`run_android_probe.py` adds this source and the official API SDK via a temporary Gradle init script to each existing app. It uses API 24 minimum only for the experiment, leaving actual app configuration unchanged. It does not change package IDs, register an Activity, assemble an APK or replace current login. The UI SDK/Compose authentication flow has not been compiled or integrated.

```bash
python3 scripts/clerk/run_android_probe.py --app customer --output Docs/clerk/evidence
python3 scripts/clerk/run_android_probe.py --app vendor --output Docs/clerk/evidence
python3 scripts/clerk/run_android_probe.py --app driver --output Docs/clerk/evidence
```

All three native compilation probes passed. Logs/commands/durations are under `evidence/`. They used the existing local debug Firebase-disable property because owned Firebase client files are unavailable. FCM source/default wiring and the release prohibition on that property are intact; this does not verify push delivery.

## Remaining feasibility gate

The public development Clerk endpoint was blocked by the workspace proxy (CONNECT 403). No Clerk session or Google callback could be tested. There is no attached Android device or KVM emulator available for real lifecycle checks. The SDK's core compilation is promising, but does not verify any of:

- Native sign-up/sign-in, email verification, configured password/Google methods and recovery.
- Callback ownership, browser/native credential manager behavior, cancellation, rotation and process death.
- Keystore persistence on cold start, refresh after token expiry, provider revocation, offline errors and account switch.
- Secure logout and SDK state changes reaching REST/socket clients after reconnection.

Before client cutover, implement and test those flows with the official SDK, preserve Grozo styling, and expose only fresh session tokens to Dart. Use an SDK session-change stream to cancel stale requests/sockets and clear account-specific state. Never copy Clerk credentials into `SecureSessionTokens`, SharedPreferences, local files or application JWTs. FCM cleanup must occur for the outgoing account before its token becomes unavailable.

Customer profile/delete flows, vendor pending/approved/rejected/suspended screens and rider application/duty/approval workflows all still need integration. Do not remove any existing login while this gate is unresolved.
