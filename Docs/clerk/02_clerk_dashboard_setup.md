# 2. Clerk dashboard setup

1. Sign in to the Clerk dashboard as the application owner. Rotate/delete the Secret Key previously pasted into chat. Do not send the replacement in chat, Git, screenshots or APK configuration.
2. Set the application display name to Grozo and configure the supplied owned Grozo logo in the dashboard for provider/email branding. Use the development instance for staging. All four Grozo clients must share this instance. Keep a separate production instance and database for an eventual approved launch.
3. Under authentication settings, enable email/password and email verification for the intended test flow. Enable sign-up, password recovery and optional MFA as required. Do not disable verification merely to make a test pass.
4. If Google login is needed, enable the Google connection, configure owned OAuth credentials where required, and complete Clerk's displayed Google provider callback setup. A disabled Google connection will not appear in the SDK UI.
5. Copy the Publishable Key to the admin's `VITE_CLERK_PUBLISHABLE_KEY` and Android public build configuration. Copy the **rotated** Secret Key only to Render's `CLERK_SECRET_KEY`.
6. Add the exact Vercel admin origin to Clerk's authorized web origins/redirect settings. Put the same origin in backend `CLERK_AUTHORIZED_PARTIES` and `ADMIN_URL`. Do not use wildcard deployment origins. Development preview URLs need explicit configuration too.
7. Register all Android applications in Clerk's native/Android setup, following the SDK dashboard fields. Preserve these IDs and register the SDK callback URIs below. Configure owned Google Android credentials/signing fingerprints if your selected Google flow requires them.

| Android application ID | SDK callback URIs |
| --- | --- |
| `in.grozo.customer` | `clerk://in.grozo.customer.callback`, `clerk://in.grozo.customer.oauth` |
| `in.grozo.vendor` | `clerk://in.grozo.vendor.callback`, `clerk://in.grozo.vendor.oauth` |
| `in.grozo.driver` | `clerk://in.grozo.driver.callback`, `clerk://in.grozo.driver.oauth` |

The official SDK contributes its redirect receiver through the merged manifest and validates pending OAuth callbacks. The Grozo native authentication activity is not exported. Verify browser return, cancellation and cold starts on each physical app; compilation does not prove callback behavior.

8. Create a webhook endpoint after the backend URL is available: `https://YOUR-RENDER-HOST/api/webhooks/clerk`. Subscribe to `user.created`, `user.updated`, `user.deleted`. Put the endpoint's signing secret in Render as `CLERK_WEBHOOK_SIGNING_SECRET`; it is independent of the Razorpay webhook secret. Deliver a dashboard test event and verify a successful response.
9. Create a synthetic administrator identity through Clerk. Copy its exact `user_…` ID, configure `CLERK_ADMIN_USER_IDS`, then run the operator provisioning command in document 06. Email, metadata and successful Clerk login do not grant admin access.
10. When testing, use accounts/mailboxes you control and enter verification codes delivered by the configured provider. Do not use test-code shortcuts as evidence of actual email delivery.

The backend supports optional `CLERK_AUDIENCE`; leave unset unless the same audience is explicitly configured on Clerk session tokens. The instance issuer is the exact HTTPS frontend API origin (for the provided development public key: `https://enhanced-foal-30.clerk.accounts.dev`).

Rotating only the backend Secret Key keeps the same instance/public key for these APKs. Changing the Clerk application or Publishable Key requires rebuilding them.
