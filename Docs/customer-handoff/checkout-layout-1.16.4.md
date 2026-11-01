# Customer checkout and store layout — 1.16.4+28

Source: `80878bedf5d3f3e096a27b53bcb19d5c8e209974` on `fix/customer-checkout-layout-20261101`.

Nearby store cards now reserve enough room for long names, status and distance, including at 2× text scale. Checkout presents the order, bill, payment/delivery availability, then the delivery address last. The complete address wraps below its controls; duplicate street/locality text is omitted from display without changing saved data. Headings, address and instructions use smaller text. The delivery note supports multiple lines.

Delivery and payment readiness are separate. Checkout translates the backend's capacity reason into specific guidance, shows it once and offers **Refresh availability**. A delivery refusal keeps checkout disabled even if payment methods are present. Server prices, authentication, serviceability, stock and payment authorization remain authoritative.

## Download and installation

[Download Customer APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/28c77653d627e952f58dec09921ff019e08f6d74/clerk-staging/1.16.4-28-80878be/Grozo-Customer-Clerk-Test.apk)

SHA-256: `4bb920bd3d17e3cffb3d56cf34fa383d938968282353f672b842f2fd1ba6c17e`.

Android ARM64, API 24+, versionCode 2028. The published APK was downloaded again: HTTP 200, 53,640,124 bytes, matching SHA-256, valid ZIP, and expected compiled backend URL and recovery strings. [Manifest](evidence/checkout-layout-1.16.4/manifest.json), [checksums](evidence/checkout-layout-1.16.4/SHA256SUMS), [download verification](evidence/checkout-layout-1.16.4/downloads.json).

**New development signing certificate:** save needed local data, uninstall the older Customer preview, install this APK and sign in again. Uninstalling clears local app data; backend records remain. This preview uses the existing Render backend and Clerk development configuration. Firebase push is unconfigured. It is not a Play Store release.

## Actual verification

- [APK workflow 41307852389](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/41307852389): successful analysis, focused regressions, native Clerk handoff tests, fixture captures, Android build, APK verification and publication. The focused machine results contain 67 passed tests, zero failures and two opt-in visual skips; the separate capture step explicitly enables and runs the new captures.
- [Baseline 41307852390](https://github.com/MohdKabir958/bilnkit-clone/actions/runs/41307852390): complete Customer, Vendor and Delivery Flutter jobs, shared authentication checks, Admin/landing builds and Admin tests passed. All 1,273 backend tests passed, as did ten pricing-concurrency repetitions and seed/terminology guards. **The aggregate run failed solely at backend `npm audit --omit=dev`**, with the existing Firebase/Google transitive dependency audit blocker. No audit or test assertion was disabled.
- Layout regressions exercise long store names and full addresses at 1×, 1.6× and 2× text scale. Keyboard regressions retain the 360×640 checks at 1.3× and 2×. A transient snackbar is explicitly dismissed before checking the persistent inline notice and scrollable form.
- The three PNGs below are actual Flutter production widgets rendered with synthetic fixtures, not physical-device screenshots. They were visually reviewed. No personal account was used.

| Home | Checkout top | Address last |
| --- | --- | --- |
| [Open PNG](evidence/checkout-layout-1.16.4/home-layout.png) | [Open PNG](evidence/checkout-layout-1.16.4/checkout-top.png) | [Open PNG](evidence/checkout-layout-1.16.4/checkout-address.png) |

## Why delivery can remain unavailable

The demonstration SQL seeds stores and products, not online riders. Browsing the catalog therefore does not establish delivery availability. The backend can refuse checkout for paused delivery, a busy/full store, no eligible riders or exhausted delivery capacity. The old screenshot alone does not identify the live reason; this APK displays the actual returned reason.

An eligible rider must be approved, online, have the DRIVER business role, serve the same enabled city/zone, have real GPS updated within 120 seconds, be within 5 km of pickup and have no active assignment or suspended identity. An operator and a real approved rider must verify this workflow. Payment configuration is a separate prerequisite. This change does not simulate riders, loosen delivery checks, enable live payments or deploy production.

Physical-device installation, Clerk login, address selection, store rendering and a genuine rider-availability transition still require external verification. The local environment lacks Flutter; the linked GitHub workflows performed the SDK tests and builds.

## Engineering rules

The user's complete twelve-section engineering standards are committed in the repository's `AGENTS.md` and saved as an identical workspace-wide `/workspace/AGENTS.md`. The account profile `/home/agent/.codex/AGENTS.md` is on a read-only filesystem and could not be updated, even after write permission was granted. Account-wide persistence must be configured through Codex settings; it is not claimed here.
