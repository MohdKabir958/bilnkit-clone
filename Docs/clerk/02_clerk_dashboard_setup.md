# 2. Clerk dashboard setup worksheet

Status: **not configured or verified by this change**. No Clerk application, user, session or paid resource was created. The public development endpoint check did not reach Clerk because the network proxy denied the connection.

1. Rotate the test secret shared in chat. Put its replacement only in a private server environment/secret manager. The probe needs only a publishable key, not the secret.
2. In the Clerk dashboard, select one development application for all Grozo clients. Use a separate production instance when ready; never point test clients at live users.
3. Enable the required email/password, email verification, recovery and Google methods. Review sign-up requirements, session lifetime, multi-session behavior and allowed redirects. Do not disable verification just to make a demo pass.
4. Configure all three Android clients under the same environment's application: `in.grozo.customer`, `in.grozo.vendor`, `in.grozo.driver`. Enter the actual signing certificate fingerprints required by Clerk/Google. Debug and owned release fingerprints differ. Do not copy another application's fingerprint.
5. Verify the selected official Android SDK's callback configuration. Its supported redirect coordinator/browser flow must validate the callback and pending authentication attempt. Use distinct package-specific callbacks; test wrong callback, cancellation and activity recreation. No Android manifest/deep-link configuration has been changed yet, so do not assume callbacks already work.
6. Configure the exact localhost admin origin for development and exact owned Vercel domain for production. Preview URLs require explicit review; do not trust all Vercel subdomains. Redirect URLs must be allowlisted.
7. After backend webhook support exists, add its HTTPS Clerk webhook endpoint for `user.created`, `user.updated`, `user.deleted`. Copy the separate webhook signing secret into the backend, never a client. Test duplicate delivery, retry and old-event ordering.
8. Explicitly identify operator-approved Clerk user IDs for admin bootstrap. Registering in Clerk never grants ADMIN. Do not put authority in user-editable metadata.

Verification must include a real test identity completing verification, the backend accepting its Clerk session, a non-admin receiving 403 on admin APIs, logout/revocation, Android cold start and callback handling. None of these hosted checks has passed yet. A successful public environment request alone is insufficient.
