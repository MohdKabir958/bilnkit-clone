# Admin partner onboarding

Branch: `feature/admin-partner-onboarding`, based on `feature/flutter-start-pages` after marketplace work. Existing Grozo colors, fonts, drawers and controls are preserved. There is no second portal or replacement authentication system.

## Add a vendor

1. Start in **Vendors → Add vendor**, or Overview → Add vendor.
2. **Store:** name, one primary store category, public business phone and description. Create missing store categories in Categories first. These differ from product categories.
3. **Pickup:** enabled city, full address, locality, six-digit PIN and confirmed latitude/longitude. Obtain the vendor's real pickup pin; never guess coordinates.
4. **Access:** choose a delivery zone covering pickup and optionally enter the owner's verified email. The owner must already have signed in to Grozo and verified that email with Clerk. Leave it blank for an administrator-managed draft. A verified owner is required before checkout can work.
5. **Review:** check the full summary, confirm details and create. The store is approved but **closed**. Products, stock, owner, category and valid coverage must be ready before opening it.
6. **Add products & stock** opens inventory filtered to this new store. Create products and record received stock; a new product starts with zero stock. **Review coverage & hours** opens Cities & zones. Return to Vendors to open the store.

Back preserves fields within the wizard. Progress is in memory, never stored as personal data in browser storage. Leaving an unsaved setup clears it; a created store remains saved. Failures retain fields and show the backend error so the administrator can correct and retry. Future steps cannot be skipped. The current step receives keyboard focus, and existing drawers retain focus trapping, Escape and mobile bottom-sheet behavior.

## Add a delivery partner

1. Start in **Delivery partners → Add rider**. Existing partners are managed through Approvals (the Applications screen) and Cities & zones.
2. **Identity:** verified Clerk email, full name and operational mobile number. Ask the partner to sign in to Grozo first. No password or session token is created by onboarding.
3. **Vehicle:** Bike, Scooter, Cycle or On foot; a registration number is required for Bike/Scooter. Optional emergency contact must belong to someone else. Payout details remain in the secure partner profile.
4. **Area:** an enabled city and an enabled zone in that city. Offers still require approved status, matching service area, on-duty status and fresh GPS.
5. **Review:** leave the check box clear to create a **pending, offline** partner, or check it only after completing identity/vehicle checks to create an **approved, offline** partner. Approval never puts a rider online automatically.
6. The completion screen links pending partners to Approvals and provides a service-area shortcut. An approved rider signs in to the delivery app, grants location permission and goes on duty.

## Server security

`POST /api/v1/admin/riders` requires authenticated Grozo ADMIN access and Clerk mode. The backend looks up a verified, non-banned provider identity by exact normalized email. It then links only the existing Grozo `clerkUserId` association under the same identity advisory lock used by Clerk provisioning/deletion. It never claims an old account using matching email or phone. UUIDs and historical records remain intact.

Customers cannot call this endpoint or self-approve from the rider app. Admin/vendor/suspended/deleted identities and outstanding admin invitations cannot be repurposed. Existing rider records return a conflict rather than being overwritten or unsuspended. City and zone are checked in the transaction. Approval must be a JSON boolean. A rider starts offline without availability GPS; every successful creation is audited. Double submissions are guarded in the UI; concurrent server calls create only one rider. No authentication bypass, messages, real payments or production database changes are introduced.

The small cash-rejection copy correction now tells a customer that no cash was collected when a cash order is rejected, rather than promising a gateway refund. Financial behavior is unchanged.

## Deploy and verify

Deploy the final main/feature code to the existing Render service and Vercel project (`web/super_admin`). No new onboarding-specific secret or paid resource is required. The marketplace additive Prisma migration must already be deployed using the existing safe hosted start wrapper. Never reset Neon. Clerk, exact admin CORS/authorized-party origin, Razorpay TEST configuration and owned Firebase setup remain operator responsibilities documented in `../clerk/`.

Browser screenshots in `screenshots/` are actual implemented React components with explicitly labelled synthetic API fixtures. Native Flutter screenshots are in `../ui-ux/start-pages/`. They are not hosted-session or physical-device captures. The browser capture exercises the full four-step vendor and rider flow, explicit approval, mobile layout and new-store inventory navigation. Run `node scripts/ui_ux/marketplace/server.mjs` followed by `node scripts/ui_ux/marketplace/capture-onboarding.mjs` to reproduce them locally.

See `verification.md` and `evidence/` for actual complete runs, commands and remaining external-service checks.
