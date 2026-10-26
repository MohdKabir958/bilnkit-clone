# Security review and practical limits

The complete backend regression covers existing authentication, role/ownership boundaries, approval/suspension, Socket.io room isolation, order transitions, independent Razorpay webhook signatures, notification-device ownership, refunds and settlement behavior. Clerk fixtures are explicitly mocked; genuine hosted provider/session checks remain external.

Implemented safeguards:

1. Client deployment headers are diagnostics only and cannot grant a role or identity. Missing/invalid identity is still rejected. A contract mismatch returns 409 rather than silently logging out or changing authentication mode.
2. Store/rider approval and resource ownership are rechecked server-side. Schedule/performance endpoints are restricted to the approved store owner; a customer/another vendor/suspended vendor is denied.
3. GPS exception requests require evidence and a different administrator's approval, expire quickly and are scoped to pickup or drop-off. Administrators and riders cannot use the ordinary transition route to bypass v2 proof. OTP/cash checks remain intact.
4. Payment creation and refund submission have durable idempotency/unknown-state handling. Provider calls do not hold DB locks. Pending asynchronous refunds are not marked complete. Partial/full refunds preserve original captures and settlement holds.
5. Physical shortages are recorded atomically; unusable/packed returns never reappear automatically in sellable stock. Client quantities/prices do not override server calculations.
6. COD financial evidence is append-only, unique-reference controlled and independently reviewed. A daily close cannot be self-approved. A ledger entry is not represented as proof of a bank transfer.
7. Private support evidence is size/type/dimension/quota bounded, integrity checked and case-authorized; retention is 90 days. It is separate from public product storage, including resolved symlink paths. Recovery tools reject traversal, links and overwrite targets.
8. Readiness requires the expected schema/migration state and writable separate storage. Diagnostics redact database URLs/credentials, tokens, private identity and raw Prisma arguments.
9. Public support alerts omit note bodies, addresses and financial details. Case/note references are strictly parsed; the target thread is fetched through the existing authenticated ownership boundary. Internal notes never stage notifications. Per-device acknowledgments use token hashes and are lease-fenced; ambiguous provider delivery remains at-least-once, not a false exactly-once guarantee.
10. Durable jobs use database claims/fences/heartbeats and bounded retries. Operator retry cannot duplicate a live lease. Expired notification offers are suppressed.
11. `body-parser` and `follow-redirects` received compatible security patches. The recorded backend production dependency audit has zero vulnerabilities. Admin's recorded audit is also clean.

No production credentials, private database archives or real financial records were added to Git. Public Clerk publishable settings are intentionally client-visible. Previously exposed backend/database credentials require secure operator rotation; rotation cannot be verified from this workspace. Preserve the payout encryption key securely so existing encrypted details stay readable.

Not certified by local tests: deployed Clerk revocation/session behavior, real FCM delivery, Razorpay-hosted processing, provider routing, disk ownership/restore on Render, off-site retention/RPO/RTO, physical Android installation or Play Store policy approval. APK verification includes permissions for manual review. Existing vendor full-screen-intent/battery-optimization permissions need Play-policy assessment before store release; these staging APKs are not represented as Play-ready production releases. Review the current official Android/Google Play target SDK, full-screen intent and Data Safety policies in the publishing console before release.
