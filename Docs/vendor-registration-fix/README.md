# Vendor registration and opening a store

Vendor app version: **1.14.0+21**. Source branch: `fix/vendor-self-registration`.

[Download updated vendor APK](https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/61dc396ad8d61959f9bb62e9a7286e9176c54ce4/clerk-staging/1.14.0-21/Grozo-Vendor-Clerk-Test.apk). Deploy backend source `c5d8636` or later first.

## Why the old screen failed

Clerk sign-in identifies the person; it does not create or approve a store. The old form hid both the password and mobile fields in Clerk mode while still requiring a mobile number. Validation silently stopped submission because the missing field was invisible. The login also requested a partner-only profile for people who had not yet applied, and discarded the backend's explanation. Its category choices were old food categories.

## Vendor: register, add products, open

1. Install the updated vendor APK. The backend must also have this update deployed. It uses the existing Render HTTPS API and native Clerk sign-in.
2. Sign up or sign in with the **store owner's account**. Continue to the store; an owner without a store goes directly to **Set up your store**.
3. Enter the store name, pickup address, an available **store category**, owner name and ten-digit **store contact number**. This business number is visible to customers; it is not a replacement Clerk login or verified identity claim. Detect the pickup GPS while actually at the shop if possible. FSSAI is optional in the form; Grozo still reviews applicable requirements.
4. Tap **Submit store application**. A successful request shows the approval screen. A failed request keeps the form and explains what needs correcting. Missing categories have an explicit retry action.
5. Wait for Grozo approval. The pending, rejected or suspended account cannot enter order/product management. Use **Refresh** or the existing approval polling; rejected applications can be corrected and resubmitted.
6. Once approved, open **Products and inventory → Add product**. Enter the product name, category, SKU, pack size/unit, price and image with the required rights declaration. Save it. New vendor products go for Grozo review.
7. Use the product's stock action to record received stock. A new product starts with zero stock; saving a price does not invent stock.
8. After product approval and delivery coverage setup, turn the store **OPEN**. Customers with a serviceable nearby delivery address can discover the store and its approved, stocked products. Customer order requests appear in the store's existing order queue.

Use a separate store-owner account if the current identity is already an administrator, rider, or an established customer with order history. This preserves ownership and historical records. The app explains that conflict; it never silently converts an administrator or attaches another owner's shop.

## Administrator: review and configure the store

1. **Categories:** maintain active categories enabled for stores. A store category is different from a product category. The app reads the managed list; it does not make up category IDs.
2. **Approvals:** review the self-submitted store and approve/reject it. Approval remains a server-side administrator decision. Do not add a second duplicate store using the new-store wizard for the same application.
3. **Cities & zones → Store location and hours:** select the existing store, enabled city, locality, PIN, real full address and confirmed pickup coordinates; save its location/hours.
4. **Cities & zones → Assign store coverage:** assign an enabled delivery zone in the same city. Changing a pickup location disables old coverage for review; re-enable only the correct coverage.
5. **Products and inventory:** review the vendor's submitted products and stock. Existing catalog moderation, image authorization, pricing and inventory rules remain active.
6. **Vendors:** check the correct owner/store association and opening status. Orders still require the real backend's serviceability and store-readiness rules; toggling OPEN alone does not create coverage.

## Deployment

Push/deploy the source update to the existing Render service **before distributing the replacement APK**. The app uses authenticated `GET /api/partner/vendor/onboarding`; an older backend will not implement it. Render must deploy a commit containing this route. No new secret, database reset, infrastructure resource or schema migration is needed for this patch. Keep existing startup migration commands, Clerk configuration, uploads, payment configuration and Firebase setup.

No live database was modified for this fix. The screenshots and local tests use explicitly synthetic accounts/data. Real Clerk-hosted login, installing on the user's phone, real GPS and the deployed approval/order cycle still require an operator/device check. FCM source remains intact; the staging APK's owned Firebase configuration limitation is unchanged. Customer and delivery app designs are untouched.

## Implementation

- Added read-only, authenticated own-store onboarding discovery. Fresh identities can see registration without receiving a VENDOR role, store row, approval, product access or order access.
- Kept Clerk session verification, suspension checks and database ownership/approval authoritative. Store submission still locks the account and rejects duplicate/role-conflicting applications.
- Added managed primary-category association and explicit public business phone to new store applications; validates active store categories transactionally. Older clients without a managed category still create only pending applications for operator setup.
- Preserved managed-category IDs through profile refresh, persistence and pending/rejected application editing.
- Fixed the visible contact field, native-Clerk-only password handling, validation summary, useful backend errors, duplicate-submit guard and malformed-success handling.
- Routed identity-only owners into setup, applicants into the existing approval screen, and approved owners into the existing store dashboard. The first-product shortcut explicitly activates the inventory tab.
- Clarified product/stock/review/open instructions without changing the Grozo theme or replacing existing order, catalog, payment or delivery architecture.

Actual widget-rendered registration captures: [form](screenshots/store-registration-top.png), [submission/contact](screenshots/store-registration-submit.png). They are not generated UI or physical-device screenshots. See `verification.md` for exact checks, limitations and artifact details.
