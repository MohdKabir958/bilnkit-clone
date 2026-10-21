# 10. Install the APKs and record real-device results

These are Grozo **Clerk authentication previews**, version `1.10.0+16`, ARM64, Android 7/API 24 or newer. They are development-signed and are not Play Store releases. The staging backend is unconfigured; shopping, store management, approvals, delivery operations, payments and FCM cannot be tested through these previews. Rotate the previously disclosed Clerk Secret Key before signing in.

## Download and install

1. Open the direct GitHub APK links in the handover (`android-artifacts.md`) using Chrome on your Android phone. Each link downloads one actual `.apk`; it is not an expired chat attachment or workspace artifact.
2. Wait for the complete download. Compare its filename/size with the manifest. For a strong integrity check on a computer: `sha256sum filename.apk` (PowerShell: `Get-FileHash filename.apk -Algorithm SHA256`). Compare with `SHA256SUMS`.
3. Open Downloads and tap the APK. If Android asks, allow **Install unknown apps** for the browser/file manager used for this installation. You can switch that permission off again afterward.
4. Install Customer, Vendor and Delivery separately. Their package IDs are `in.grozo.customer`, `in.grozo.vendor`, `in.grozo.driver`.
5. If Android reports a signing conflict with an older development build, export anything you need first. Uninstalling that older app deletes its local data. Do not uninstall a production app containing data you need merely to test a preview.
6. Open each app. It must say Clerk authentication preview and backend unconfigured. Native Clerk sign-in should open after Continue; no Grozo password or passcode fallback should appear.

## Troubleshooting

| Problem | Action |
| --- | --- |
| “Could not download artifact” in chat | Use the persistent direct GitHub links, not the old chat attachment. Verify the download finishes; try Chrome/another network. |
| APK parsing / not compatible | Check ARM64 support, Android >=7, full size and SHA-256; download again if truncated. |
| “App not installed” | Check free storage and signing conflict; use a separate test device if preserving an existing installation. |
| Clerk cannot connect | Check phone internet/date/time, instance configuration and key rotation. Record the visible error, not raw tokens. |
| Google missing / does not return | Enable Google in Clerk, complete provider/native callback configuration, then retry with a browser installed. |
| Signed in but marketplace unavailable | Expected in these previews. Deploy staging and rebuild with its real HTTPS origin to test business workflows. |
| Push notifications absent | Expected: owned Firebase configuration is not included. |

## Real-provider authentication checks (repeat per app)

Use only synthetic accounts/mailboxes you control. Enter the actual verification code delivered to that mailbox. Do not share the code/password with the developer. Record Pass, Fail or Not tested; defaults below are intentionally Not tested.

| Check | Customer | Vendor | Delivery | Evidence/notes |
| --- | --- | --- | --- | --- |
| Native sign-up, verification email delivered and accepted | Not tested | Not tested | Not tested | |
| Correct password login; wrong password rejected | Not tested | Not tested | Not tested | |
| Google sign-in and browser callback, if enabled | Not tested | Not tested | Not tested | |
| Cancel browser/auth screen returns safely | Not tested | Not tested | Not tested | |
| Close/reopen and force-stop/reopen preserve intended session | Not tested | Not tested | Not tested | |
| Session renewal after waiting / backgrounding | Not tested | Not tested | Not tested | |
| Recovery email/code and new-password sign-in | Not tested | Not tested | Not tested | |
| Online sign-out, reopen stays signed out | Not tested | Not tested | Not tested | |
| Offline sign-out clears phone state and reports remote uncertainty | Not tested | Not tested | Not tested | |
| Switch A → B without A's private data/session | Not tested | Not tested | Not tested | |
| Clerk revoke/ban terminates connected backend access | Not tested | Not tested | Not tested | Requires staging |

## Connected staging checks (after deployment and APK rebuild)

| Check | Result | Notes |
| --- | --- | --- |
| Customer can access only own profile/addresses/orders | Not tested | |
| Vendor application stays pending until admin approval | Not tested | |
| Vendor cannot read/edit another store's inventory/orders | Not tested | |
| Rider application stays pending/offline until approval | Not tested | |
| Customer cannot gain rider/admin access by selecting another app | Not tested | |
| Rider cannot claim/track/complete another rider's assignment | Not tested | |
| Delivery state transitions/code verification unchanged | Not tested | |
| Explicitly provisioned admin signs in; customer is denied admin API | Not tested | |
| API/socket renewal, expiry, logout and account-switch isolation | Not tested | |
| Signed Clerk webhook duplicate/stale/deletion behavior | Not tested | |
| FCM owned-device isolation with owned Firebase setup | Not tested | |
| Razorpay sandbox verification/refund with real test credentials | Not tested | |

Record device model, Android version, APK SHA-256, date, app name, expected/actual result and a redacted screenshot when useful. These tables are a handover checklist, not claims that the tests were performed. Production cutover remains pending successful results and explicit approval.

## Expected results for the security and lifecycle checks

- Customer in the Vendor/Delivery app: Clerk may authenticate the identity, but connected Grozo operations must be denied until a separate appropriate application and admin approval. Merely selecting the app cannot grant a store or approved rider profile.
- Non-admin in the admin website: sign-in can succeed, but the private admin shell must not mount and admin API calls must return 403.
- Wrong password: remain signed out, display the provider error, never return to a legacy login.
- Verification/recovery: require the actual provider-delivered code/link; only a completed verified flow may create a usable session. The previous password must stop working after a successful reset.
- Google/callback cancellation: successful Google authentication returns to the initiating app; cancellation returns safely without a false signed-in state.
- Reopen/renewal: restore only the intended SDK session; expired/revoked sessions cannot authorize API/socket requests. Session renewal should not expose old-account state.
- Online logout/reopen: remain signed out; the ended session must not authorize backend requests. Offline logout: phone state clears, with an honest remote-revocation warning; retry/check the provider session when online.
- Account A → B: A's profile, store, orders, notifications and private socket rooms must disappear before B's data can load.
- Offline/recovery: show a recoverable connection error, grant no private business access, retain no alternative JWT/password bypass; retry safely when internet returns.
- Pending/rejected/suspended partner: login does not override Grozo's status; inventory, assignment and delivery operations remain denied.
- Deletion: preserve required business/financial IDs, remove private profile/address/support data according to policy, revoke/block future access. Do not test this on live accounts.

Android split-per-ABI packaging adds its ARM64 offset to the Flutter build number: base build `16` produces actual manifest `versionCode=2016`, with `versionName=1.10.0`. The verification manifest records both values.
