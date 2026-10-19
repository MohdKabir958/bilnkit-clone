# External services and credentials

FCM is retained in all three mobile apps and the backend. Source inspection found Firebase Core/Messaging plus local notification integrations, not a Firestore or Firebase Auth data layer. PostgreSQL remains authoritative.

| Integration | Configuration and validation boundary |
|---|---|
| Firebase FCM | Create/own a Firebase project; register the three IDs from `branding/brand.json`; provide matching Android `google-services.json` files and backend-only `FIREBASE_KEY_PATH`/service-account binding. Never copy the Admin private key into apps. Check notification permissions, token refresh, foreground/background/terminated delivery on real devices. Current credentials and sends are unverified. |
| Google customer sign-in | Set `GOOGLE_WEB_CLIENT_ID` and matching Android client IDs/SHA fingerprints in an owned Google project. Existing customer login uses Google, not SMS OTP. Mock verifiers are tests only. |
| Razorpay | Use TEST key ID/secret/webhook secret securely in backend. Client receives public ID only; server verifies/captures and processes signed callbacks. Disablement is local-only, not a simulated successful payment. Gateway sandbox integration remains unverified. Do not enable live payments without authorization. |
| Payouts | Manual ledger/reference path exists. RazorpayX automatic disbursement is explicitly unavailable and must remain described as pending integration. |
| Maps | Existing Android Maps keys use environment/Gradle binding; general provider adapters are Phase 2 work. Never use unrestricted public OSM geocoding/tiles as a production backend. |
| Images | Local validated upload handler exists; durable object storage, access policy and backup strategy are not completed. |
| SMS | No verified SMS provider integration exists. Do not describe current Google login as mobile OTP authentication. |

Keep external secrets out of Git, generated branding, test outputs and frontend bundles. Root MIT licensing does not confer rights to the upstream operator's Firebase project, logos, domain names or photos.

Cloud setup uses registry.npmjs.org, GitHub, binaries.prisma.sh, deb.debian.org, pub.dev and storage.googleapis.com. The two custom download domains were saved in the environment draft. Production service network destinations should be added only when the chosen integration is configured.
