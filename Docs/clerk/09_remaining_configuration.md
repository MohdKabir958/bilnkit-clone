# 9. Remaining configuration and honest limits

No backend, Neon database or Vercel admin has been deployed by this change. No paid resources were created. The current APKs are authentication previews, not connected marketplace builds.

The owner/deployment operator must complete:

- Rotate the disclosed Clerk Secret Key; store the replacement only in Render/backend secure settings.
- Enable intended email/password/verification/recovery and optional Google in the shared development Clerk application; configure all Android callbacks and signing requirements.
- Create a fresh isolated Neon staging database and collect pooled/direct TLS URLs.
- Review Render Starter and persistent disk prices before provisioning; configure staging exactly as document 07, never against production data.
- Supply the actual Render HTTPS and Vercel admin origins, generate/commit the exact CSP, configure CORS and Clerk authorized origins.
- Create the Clerk webhook, install its signing secret and verify a signed delivery.
- Explicitly provision the administrator subject. Link historical UUIDs only after verified operator ownership checks.
- Rebuild connected APKs with the real backend origin. Install/test all three on physical Android devices and fill document 10.
- Supply owned Firebase client/service configuration to test FCM. Preview builds explicitly omit it; source preservation is not delivery verification.
- Use real Razorpay **test** credentials only when sandbox payment testing is desired; otherwise the isolated development service deliberately disables payments and checkout cannot charge.
- Complete real-provider/browser/device/security checks before approving any production Clerk-only cutover.

The public development instance may be reachable from a phone even though this cloud environment's proxy rejects its hostname. That proxy limitation is not evidence that provider authentication succeeded or failed. Automated tests use signed local JWTs, verified webhook fixtures, mocked Clerk HTTP responses and SDK/channel UI fixtures. They are not Clerk-hosted authentication results.

Do not send passwords, verification codes, session tokens or replacement secret keys in chat. Non-sensitive URLs, Clerk user IDs for operator provisioning, build hashes and redacted Pass/Fail results are sufficient for handover.
