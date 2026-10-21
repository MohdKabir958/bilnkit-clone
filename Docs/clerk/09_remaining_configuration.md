# 9. Remaining configuration and blockers

**The migration is not complete. Current Grozo login remains in place.** No new Clerk credentials were saved, no hosted database was modified and no paid infrastructure was created.

## What blocks stage 1

1. A machine/network that can reach the development Clerk frontend API. This workspace's proxy rejects the supplied instance's public `/v1/environment` connection with CONNECT 403. The request never reached Clerk, so this says nothing about whether the supplied secret is valid.
2. An Android device or usable emulator for native sign-in/Google/callback/persistence/refresh/logout/revocation checks. Core Kotlin compilation passed in all three apps, but those functional/security checks remain unresolved. The current container has no KVM device or attached phone; attempting adb also encountered its default home state directory's filesystem restriction.

The request explicitly says: “If the Clerk Flutter feasibility check reveals an unresolved security or functionality blocker, stop before destructive auth removal and report the specific blocker.” The work stopped at that gate. No backend-only partial cutover, parallel custom Clerk session issuer or demo authentication bypass was introduced.

## Configuration needed before resuming integration/deployment

- Rotate the Secret Key pasted in chat and place the replacement only in private backend settings. Publishable keys may be used in clients; the Secret Key and Clerk webhook signing secret may not.
- Confirm the same development Clerk application has the required email verification/password/recovery and Google methods configured for all clients.
- Supply owned Android signing certificate configuration and configure all three package-specific callbacks in Clerk/Google. Keep `in.grozo.customer`, `in.grozo.vendor`, `in.grozo.driver`.
- Identify the explicitly approved initial **Clerk user IDs** for operator-only admin bootstrap. No arbitrary customer should become admin.
- Confirm exact Render API and Vercel admin HTTPS URLs, reviewed Clerk issuer/authorized parties, webhook endpoint/secret and CORS/CSP resource domains. Actual hosted URLs were not provided or provisioned here.
- Provide separate Neon pooled runtime and direct migration TLS URLs through secure environment settings when deployment is authorized. Never paste database passwords into documentation or Git.
- Preserve independent Razorpay test/production configuration, payout encryption and owned Firebase client/service configuration. No fabricated payment credentials or FCM migration to Clerk.

The templates under `templates/` are worksheets for the **future** cutover, with no secrets. Existing runtime files still require legacy configuration. Do not deploy those templates as though the Clerk implementation already existed.

Stages 2–12 remain: identity migration/linking; backend roles/verification; admin/customer/vendor/rider integration; webhooks/sockets; equivalent tests; legacy removal; hosted configurations; full regressions/builds; and verified release/handover. These cannot be described as completed from the compile-only probe results.
