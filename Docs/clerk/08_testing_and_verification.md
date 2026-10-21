# 8. Actual testing and remaining verification

Status: **mobile feasibility gate not cleared; migration acceptance not reached**.

## Evidence from this change

| Check | Actual result | Evidence |
| --- | --- | --- |
| Published Flutter beta source | Checksums match; default credential JSON storage and embedded Google WebView identified; defaults rejected | `evidence/mobile-feasibility.json` |
| Official Android API SDK source | Maven source checksum matches; Keystore/AES-GCM, refresh and sign-out APIs inspected | Same JSON |
| Customer Kotlin/MethodChannel probe | Passed, exit 0 | `evidence/customer-native-compile.json` and `.log` |
| Vendor Kotlin/MethodChannel probe | Passed, exit 0 | `evidence/vendor-native-compile.json` and `.log` |
| Rider Kotlin/MethodChannel probe | Passed, exit 0 | `evidence/driver-native-compile.json` and `.log` |
| Probe safety/reporting tests | 7 passed, exit 0 | `evidence/probe-tests.txt` |
| Inventory freshness | 200 referenced files; 161 endpoint registrations; 20 middleware/router registrations | `migration-inventory.json`; `node scripts/clerk/inventory.mjs --check` |
| Real Clerk endpoint connectivity | Failed at workspace network proxy: CONNECT 403, including a retry outside the sandbox; not an invalid-key response from Clerk | `evidence/mobile-feasibility.json`, `evidence/environment.json` |
| Real Clerk login, refresh, revocation, webhooks | **Not verified**; no authenticated Clerk request made | Explicit gate remains false |
| Physical Android / real callback lifecycle | **Not verified**; no device/KVM emulator available | Environment limitation |
| New backend/admin/Flutter auth regressions and APK assembly | **Not run/not implemented**; runtime cutover stopped at stage 1 | Do not interpret native compilation as APK/login verification |

The official SDK's Kotlin probe compiled using existing Android projects, Java 21, Gradle 9.1.0, AGP 9.0.1 and Kotlin plugin 2.3.20, against the installed Flutter toolchain. Each JSON report records its exact command, working directory, duration, exit code and environment variable names. Compile warnings about existing plugin/AGP deprecations remain visible in complete logs. No compiler metadata checks or verification were disabled to force success.

One preliminary local probe attempt failed because Flutter tried to write default home configuration in a restricted filesystem. The recorded probes use the workspace's established XDG/Pub/cache environment. This was a tooling setup correction, not a Clerk code/test failure. The first safety-test attempt had an exhausted mock response list in the probe test itself; it was corrected to represent successful public connectivity. These tests concern reporting and URL/archive safety, not mocked identity validation.

The existing `Docs/qa/final-backend-regression.md` and full-run log describe the **previous baseline**, not a Clerk migration regression run. Their 1,064 passing backend tests must not be relabeled as Clerk tests. No application/backend runtime source changed in this stage, so the full legacy suites were not rerun to imply migration acceptance.

The public registry responses identifying the maintained React/Express packages and the deprecated React package are recorded in `evidence/web-sdk-registry.json`. Toolchain versions and absence of KVM/USB device interfaces are recorded in `evidence/environment.json`.

Raw compiler logs retain the tool's output, including three trailing-space warnings from Flutter's own diagnostic text. Source/document whitespace checks exclude those unmodified evidence logs.

## Reproduce the probes

Use the repository's installed toolchain and writable environment locations (adjust SDK paths on another machine):

```bash
export JAVA_HOME=/workspace/.tools/jdk/java-21-openjdk-amd64
export ANDROID_HOME=/workspace/.tools/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME=/workspace/.android
export GRADLE_USER_HOME=/workspace/.gradle
export PUB_CACHE=/workspace/.pub-cache
export XDG_CONFIG_HOME=/workspace/.config
export XDG_CACHE_HOME=/workspace/.cache
export ANALYZER_STATE_LOCATION_OVERRIDE=/workspace/.dartServer
export DASH__SUPPRESS_ANALYTICS=true
python3 scripts/clerk/run_android_probe.py --app customer --output Docs/clerk/evidence
python3 scripts/clerk/run_android_probe.py --app vendor --output Docs/clerk/evidence
python3 scripts/clerk/run_android_probe.py --app driver --output Docs/clerk/evidence
python3 -m unittest discover -s scripts/clerk -p 'test_*.py' -v
node scripts/clerk/inventory.mjs --check
```

For public source/connectivity review, set only the development `CLERK_PUBLISHABLE_KEY` privately and run `mobile_feasibility.py`. Exit 2 deliberately means static review cannot clear a real-device/authentication acceptance gate. It is not a failing authentication test that should be skipped or changed to green.

## Required final migration regression (still outstanding)

After genuine mobile feasibility passes, implement and test customer registration/login/verification, partner approval/suspension, explicit admin bootstrap, private resource isolation, invalid/forged/expired/wrong-instance/wrong-party/audience tokens, online revocation, duplicate/out-of-order webhooks, ownership linking conflicts and concurrency, logout/account switching, protected socket rooms/events, independent Razorpay HMAC and owned FCM devices.

Then update fixtures to the real Clerk verifier boundary, preserving each business authorization assertion; report mocked fixture tests separately from genuine provider tests. Run the entire backend Jest suite once against a fresh UTF-8 isolated PostgreSQL database with all migrations and deterministic state, recording complete logs/JSON/counts/duration/exit code. Do not disable failed tests. Run admin tests/build, all three Flutter analysis/tests, supported Android builds and owned-device/provider integration checks. Preserve order, stock, refund, settlement and dispatch concurrency regressions.

Production release builds also require owned signing/Firebase configuration, actual HTTPS endpoints, and the final SDK callback configuration. No current APK should be described as a Clerk-enabled build.
