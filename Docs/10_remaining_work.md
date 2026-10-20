# Remaining launch work and verification boundaries

The four implementation phases have code integrated in the existing backend, admin website and three Flutter apps. Local acceptance evidence and exact test/build results are in Docs/04–05 and `Docs/evidence`. This is a controlled-pilot implementation; production readiness requires the following operator gates.

| Gate | What remains |
|---|---|
| Owned Google sign-in | Configure owned web/Android OAuth clients and signing fingerprints; verify real customer login and account recovery on devices. Test verifiers are test-only. |
| Owned FCM delivery | Supply three matching Firebase clients and backend service-account binding; test permissions, token refresh/account switch, offline retry, foreground/background/terminated notification handling and navigation on real Android devices. Automated tests validate recipient/outbox/token behavior with an explicit sender double. |
| Razorpay TEST gateway | Supply authorized TEST keys/webhook secret and validate UPI/capture/duplicate webhook/cancel/refund/reconciliation. The normal development API has payments disabled; automated provider simulations do not establish external sandbox success. Live mode requires separate authorization. |
| Android distribution | Supply the operator keystore, HTTPS API/socket targets, Google client and Firebase clients; build signed release APKs and validate real GPS, gallery permissions, maps/navigation, secure storage, battery/network loss and background notifications. Debug APK compilation uses an explicit Firebase bypass. No emulator or physical device was available. |
| Deployment operations | Configure owned DNS/TLS, production secret bindings, private database, persistent image volume and backup storage, operator alerts and error collection. Container build/readiness and isolated restore are local checks; production Caddy/DNS/deployment and recovery under a real outage are unverified. |
| Business/legal/support | Grozo branding is applied. Set the real support email and operator identity; approve consumer/refund/privacy/terms, tax/invoices, FSSAI where applicable, rider rules and retention policy with qualified reviewers. Public legal pages are drafts. Review inactive inherited asset provenance and final distributable notices. |
| Access/security assessment | Agree admin access/MFA policy, independently assess authorization/uploads/payments and run a measured pilot load test. Process-local limits and maintenance are intended for one API instance; multi-instance dispatch/worker/limits need a scale review. |
| Automatic payouts/storage scale | Manual settlement ledger is implemented; real bank disbursement is pending provider integration/authorization. Persistent filesystem images work for one API instance; object-storage/CDN integration is optional future scale work. |

The local pilot has two stores, 80 products, three customers and three approved offline riders in one configurable Indian city. Enable confirmed service circles and rider duty through admin/partner operations. Generated passwords remain private in ignored local storage and must be rotated before real onboarding. Two geographically distinct cities and complete order/refund/OTP lifecycles are covered by real database/HTTP/socket tests using explicitly simulated external providers.

iOS native project scaffolding is absent in the inherited checkout. Cross-platform Dart is retained; iOS build, signing and permissions are unverified. No national delivery availability, legal compliance, real money movement or externally verified notification delivery is claimed.

Cloud setup instructions are saved as a draft after local replay. Saving does not publish the environment. New-task restoration, including local-only feature commits, remains unverified; preserve the current checkout/snapshot. No protected branch push or production deployment was performed.
