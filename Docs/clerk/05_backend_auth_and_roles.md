# 5. Backend authentication and roles

`@clerk/express` supplies `clerkMiddleware()`, `getAuth()`, official token verification and webhook signature verification. Protected JSON endpoints require Bearer session tokens. The backend verifies signature, issuer, expiry, optional audience and authorized party, then queries Clerk session/user status online. Invalid/expired/revoked sessions return 401, banned or unauthorized identities 403, provider availability failures fail closed. No redirect-based API authentication is used.

Native tokens may have no `azp`. Permit this only with explicit `CLERK_ALLOW_NATIVE_WITHOUT_AZP=true` and requests without an Origin header. A present `azp` must always match `CLERK_AUTHORIZED_PARTIES`. This exception does not replace cryptographic verification, online session checks or resource authorization. Browser CORS stays restricted to exact configured origins.

The Clerk subject resolves only via unique `User.clerkUserId`. First request can safely create a customer UUID without waiting for a webhook. It does not match existing email/phone accounts. PostgreSQL advisory locks serialize provisioning, webhooks and linking. Operator linking also locks the UUID row to prevent conflicting subjects. Metadata roles are ignored.

| Identity | Grozo authority |
| --- | --- |
| Customer (`STUDENT` internal compatibility enum) | Owned addresses, orders, devices and private records only |
| Vendor | Database VENDOR association, approved store and ownership of the requested resource |
| Rider (`DRIVER`) | Approved database rider, duty/dispatch eligibility, owned assignment, existing order-state/OTP rules |
| Admin | Database ADMIN plus ACTIVE AdminAccess grant; OWNER may manage team, ADMIN may manage marketplace. Exact `CLERK_ADMIN_USER_IDS` provisioning bootstraps the first owner only; no editable metadata/body assignment |

`POST /partner/clerk-application` accepts an authenticated customer and creates a new pending vendor/rider application. It ignores password/approval input and cannot select an existing store to claim. Customers with business history cannot repurpose the account through this endpoint. Pending/rejected/suspended partner restrictions remain enforced server-side.

`POST /api/webhooks/clerk` verifies the original raw body with Clerk's signing secret before reading event data. Receipt IDs make duplicates idempotent, timestamps prevent stale updates, and deletion is terminal even if delivered late. Webhooks do not grant roles. Deletion deidentifies the identity and invalidates devices/sockets while keeping financial foreign keys. Customer in-app deletion retains existing active-order constraints, address/support cleanup and a durable provider-deletion retry flag.

Socket.io requires a verified Clerk session, checks room ownership/approval, revalidates protected packets and private recipients, periodically checks revocation (15 seconds), and disconnects at expiry. Reconnect requires a current SDK token. Revocation checks introduce Clerk API availability/rate-limit dependence; an outage denies private access. Measure hosted load before production and size provider limits accordingly.

Razorpay signatures/idempotency, payout encryption, inventory reservations and payment transitions stay separate. `DELIVERY_PROOF_SECRET` is an independent delivery-receipt HMAC key; when migrating existing records, preserve the old signing value as described in document 06. FCM token ownership checks remain active.

## Email-based team management

See [the admin workspace guide](../admin-redesign/handover.md). Owners grant email access through `/api/v1/admin/team`. The grant stays INVITED until Clerk confirms a verified email for the authenticated subject; JWT email/role claims and browser metadata cannot activate it. This explicit grant does not link unrelated business UUIDs by email. Active grants bind to the internal UUID and Clerk subject, so email recycling cannot steal access. Owners can revoke/change roles; API transactions serialize changes and protect the final active owner. Revocation removes the business ADMIN role and private socket access on revalidation. Audit entries record every grant/acceptance/role change/revocation.
