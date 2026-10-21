# Grozo administration: task-first UX and email-based access

Implement in the existing React/Express/Prisma/Clerk architecture. Preserve business UUIDs, finance, payment verification, FCM, stock, dispatch and approvals.

1. Add an audited database-backed team directory with Owner and Administrator roles. Owners manage access; Administrators manage marketplace operations. The existing explicitly provisioned, allowlisted administrator bootstraps as Owner. Future members require no per-person Render configuration.
2. Owners add an email in Team & access. An invitation stays pending until Clerk verifies ownership of that exact email. Only then bind the grant to the authenticated subject and its existing internal account; never link unrelated business records by matching email. Reject partner-account repurposing, suspended/deleted identities, unauthorized requests and last-owner removal. Revocation takes effect on API and socket revalidation.
3. Replace the Clerk-mode Add store dead end with a real store creation workflow, clearly separating store records/location/coverage from verified partner ownership and approval.
4. Reorder navigation around Overview, Orders, Vendors, Products, Delivery partners, Cities & zones, Approvals and Team & access. Add quick actions, plain-language guidance, consistent city selection and clear loading/empty/error feedback.
5. Present city setup as focused steps: cities, zones, store locations, coverage and riders. Show current configuration before edit forms. City order views must actually filter using the trusted vendor/address city; no cosmetic filter labels.
6. Redesign the login/access/loading/error screens with the existing Grozo branding and official Clerk form. Preserve keyboard access, narrow-screen behavior and CSP restrictions.
7. Add security/invitation/role/revocation tests, UX workflow tests, run full backend regression in a fresh local database, admin tests/build, and capture actual browser screenshots. Document real-provider and hosted verification limitations. Push reviewable commits and update main after checks.
