# Android acceptance sheet

The owner will perform these physical-device checks. They have **not** been performed by the cloud environment; no phone is attached. Automated widget/native builds and fixture screenshots are separate evidence. Use staging accounts and synthetic orders only. Record APK SHA-256, package/version, phone/Android version, backend commit/configuration and time before testing. Do not record tokens, OTPs, passwords or unredacted identity photos in shared logs.

| Check | Expected behavior | Customer | Vendor | Delivery |
| --- | --- | --- | --- | --- |
| Install/update | Correct package, matched version, trusted prior signing certificate | Not run | Not run | Not run |
| Clerk signup/signin/recovery | Real provider completes verification; app receives its own session | Not run | Not run | Not run |
| Restart/account switch | Session restores; logout/account switch clears previous private data and sockets | Not run | Not run | Not run |
| Approval/suspension | Customer never gains store/rider access; pending/rejected/suspended partners cannot operate | Not run | Not run | Not run |
| Offline/slow API | Clear error/retry, no fake successful operation, no duplicate writes | Not run | Not run | Not run |
| App background/resume | Fresh data/session/socket state and permission recovery | Not run | Not run | Not run |
| Capacity/serviceability | Outside-zone/unavailable capacity blocks new order/payment appropriately | Not run | Not run | Not run |
| Checkout/payment | Correct server totals/coupon/COD policy; repeated taps use existing attempt | Not run | — | — |
| Item change | Review/accept/reject full basket; lower cash/refund shown; lost response retries same key | Not run | Not run | — |
| Inventory | Stock/batches/expiry/packed cancellation inspection do not restore unusable packs | — | Not run | — |
| Store schedule/reports | IST hours and busy mode persist; correct owned store report/alerts | — | Not run | — |
| Offer race | Nearby eligible riders receive unexpired offer; only first valid accept succeeds | — | — | Not run |
| Navigation/GPS | Valid pickup/drop pins; accuracy/staleness errors recover after refresh | — | — | Not run |
| Completion | Assigned rider, fresh location, delivery code and cash confirmation all required | Not run | Not run | Not run |
| Support evidence | Authorized private photo/reply works; another account cannot access it | Not run | — | — |
| Notifications | Owned FCM configuration delivers correct account's alert; socket/poll fallback remains usable | Not run | Not run | Not run |
| Fonts/keyboard/text scale | Existing theme/reference home retained; forms usable at 360px and large text | Not run | Not run | Not run |

Report each failure with steps, expected/actual result, time and a redacted screenshot. Development-signed ARM64 Clerk test APKs are staging handovers, not Play Store releases. They intentionally lack owned Firebase client configuration; push delivery cannot be accepted until that configuration is supplied and a new verified build is produced. Online money movement needs separate approved Razorpay test/live configuration; a simulated test is not a real charge.
