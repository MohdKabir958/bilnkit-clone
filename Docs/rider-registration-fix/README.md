# Delivery partner registration fix

Delivery app: **1.14.1+22**. Source branch: `fix/rider-self-registration`.

[Download updated delivery APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/afa6fa8b85bf0537f78976534b52989590c77555/clerk-staging/1.14.1-22/Grozo-Delivery-Clerk-Test.apk). Deploy backend source `be665d1` or later first.

## Why the rider was stuck

A new Clerk account starts as an ordinary Grozo identity. The delivery welcome screen requested the existing rider-only `/partner/me` endpoint before that person had applied; its role check refused access. The app then replaced the backend's explanation with the generic connection/permission error shown in the screenshot. Signing into Clerk alone could never complete this missing step.

## Rider steps

1. Install the replacement delivery APK after the backend update is deployed. It uses the existing Render HTTPS URL and native Clerk authentication.
2. Sign up/sign in with the delivery partner's own account. A new eligible identity now opens **Become a delivery partner** automatically when continuing from sign-in.
3. Complete **full name**, **ten-digit mobile number**, and **vehicle type**: Bike, Scooter, Cycle or On foot.
4. Bikes and scooters require the **vehicle number plate**. Cycle/On foot do not. **Emergency contact** and **UPI ID** are optional existing fields; an emergency number must be someone else's. Clerk handles sign-in and account recovery; the form does not collect a second password.
5. Tap **Submit rider application**. A successful application shows the existing **Waiting for approval** screen. Invalid fields, connection failures and conflicting accounts have useful messages rather than silent button behavior.
6. Grozo reviews the application. Pending/rejected riders cannot enter delivery work. Rejected applicants can correct and resubmit their details. Suspended identities remain blocked by the existing backend authentication rules and the app explains account suspension.
7. After approval, the administrator assigns the rider to a valid city/delivery zone. The rider grants location permission and goes on duty. Existing dispatch rules still require approval, an enabled matching service area, availability and fresh GPS before offers can be assigned. Pickup, drop-off, delivery verification, cash handling and order ownership remain unchanged.

Use a separate delivery-partner identity if the account is already an administrator, vendor, or customer with order history. This keeps existing orders and financial relationships intact. Signing in with a new identity never approves a rider, grants access to somebody else's deliveries, or creates a live assignment.

## Administrator steps

- In **Approvals**, review and approve/reject the submitted delivery-partner application. Do not create a duplicate rider with the Add rider wizard for an applicant who already has a rider profile.
- In **Cities & zones → Rider areas**, assign the approved rider to the correct enabled city/delivery zone.
- Ask the rider to refresh approval status or reopen the app, allow location permission and go on duty. The app's existing approval polling can update the status automatically.
- Suspended or missing-profile accounts need an operator review. This patch does not auto-unsuspend identities or guess rider ownership from a phone number/email.

## What changed

- Added read-only authenticated own-rider onboarding discovery at `GET /api/partner/driver/onboarding`. Fresh eligible identities see registration without obtaining a DRIVER role or rider record.
- Added a presentation-only `requiresApplication` flag, carried through session refresh/persistence. It never counts as approved and cannot reach the rider dashboard.
- Kept the actual application creation transaction, role restrictions, pending/offline defaults and duplicate protections. Existing customer order history and owned driver records are preserved.
- Preserved API explanations through the native welcome screen, including wrong-role, missing-link, outage and suspension cases.
- Required a real created rider profile before treating application submission as successful. The client never sends the old custom password in Clerk mode.
- Improved visible form validation, submission wording and account-change navigation while retaining the current dark Grozo theme and controls.
- Retained native Clerk, secure sessions, FCM source, payout privacy, Razorpay verification, order ownership, Socket.io, dispatch, GPS and delivery-code protections.

## Deploy and verify

Deploy source containing this fix to the existing Render backend **before using the replacement APK**. There is one new authenticated endpoint; no database schema migration, reset, new secret or paid cloud resource is required. Keep the existing safe startup/migration wrapper and current Clerk configuration. Vercel/customer/vendor designs are unchanged.

Actual widget-rendered captures: [registration form](screenshots/rider-registration-top.png), [submit application](screenshots/rider-registration-submit.png). These render production Flutter widgets with explicitly synthetic identity/data; they are not generated mockups or physical-device captures.

See `verification.md` for exact results, build provenance, download verification and remaining hosted/device checks. The personal-test APK retains the existing owned-Firebase-configuration limitation: FCM source stays present, but push is disabled in this staging build until owned Firebase client configuration is supplied. No production database or financial data is modified by these local tests.
