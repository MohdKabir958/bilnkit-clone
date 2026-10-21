# Grozo marketplace workflow

The existing green theme, typography and component styles are retained. This change adds business workflows to the current applications.

## Customer

Choose a saved address with an accurate map pin. Grozo lists approved, serviceable stores in that city. Search store names, store categories or product names; search queries run against the full backend catalog. Store details include the public business contact, description, address, opening hours and products. Public contact is separate from the owner's login phone.

New carts contain one store. Adding products from another store asks before replacing the cart. Pricing, coupons and stock reservations remain server-controlled. Online orders reach the store after verified payment. Cash orders reach the store immediately and remain payment PENDING until the assigned rider confirms receipt of cash with a valid delivery code.

## Vendor

Use the header's Switch approved store button for multiple owned stores. Each selection rebuilds that store's queue and socket subscription. Products, stock, profile and pickup changes target the selected store. Editing pickup details pauses coverage until operations reviews the change. Store orders show whether payment is online or cash; the rider collects cash.

## Delivery partner

Going on duty requests real GPS and runs the existing visible foreground notification. Only approved, online, idle riders with a fix no older than two minutes and a configured service area receive nearby offers. Automatic dispatch starts after store acceptance: all eligible riders within 3 km receive a 45-second offer, then 5 km for two further 45-second rounds. The first valid acceptance wins under database locks. Other offers are revoked. No acceptance after three rounds stays visibly waiting in operations for retry, manual assignment or cancellation.

Before acceptance the offer contains pickup, general delivery area and payment/collection information. The full delivery address and customer contact are available only after assignment. A rider never receives the customer's verification code. Existing arrival/pickup checks remain in effect. For cash delivery, the rider explicitly confirms the full amount and enters the customer code. Cash collection and delivery commit in the same transaction; retries cannot double-collect.

Availability GPS is erased when going offline and after two minutes without refresh. GPS for an active assigned delivery continues even if the rider stops accepting new jobs.

## Administrator

In Vendors → Add vendor choose one primary store category, confirmed pickup, city and coverage. Assign an owner by their verified Clerk email. The owner must first sign in to Grozo; account linking uses their Clerk identity, never a guessed match to an old email. Existing drafts can be configured in Edit store → Marketplace setup. A store needs an approved linked owner, active primary category, confirmed pickup and valid coverage before new checkout works.

In Cities & zones enable cash on delivery only where your operations can handle it. It starts disabled. Finance → Cash collections shows cash collected by riders. Record physical handover using a receipt. A full manual cash refund can be recorded only after handover. These actions record completed offline events; they perform no bank or Razorpay transfer. Gateway refunds cannot act on cash orders.

## Deploy and exercise

1. Deploy this branch with the existing safe hosted migration/start command. Migration `20261021150000_marketplace_workflow` is additive; do not reset or overwrite Neon.
2. Keep `LEGACY_CHECKOUT_ENABLED=false` (the deployed default). Old creation routes return APP_UPDATE_REQUIRED; existing orders can still be read, paid and completed. Do not roll back to a server that cannot understand outstanding cash orders.
3. In the admin portal create store categories, finish each store's owner/category/location/coverage, then add stock and open it. Unresolved legacy category rows need operator correction; no live owner account is inferred.
4. Enable cash for a configured city if required. Use separate approved vendor/rider accounts. Configure each rider's service area; go on duty from the delivery app with location permission.
5. Install the new connected APKs. Choose an actual serviceable saved address, order from one store, accept in its vendor app and accept an offer in one rider app. Try another rider accepting simultaneously; it must lose.
6. For cash, collect the exact server total and verify the customer code at the delivery pin. Check Finance → Cash collections. For online, use your owned Razorpay TEST configuration; disabled-payment staging cannot charge money.

Clerk, FCM, Razorpay, secure storage, role checks, inventory, Socket.io and historical UUID relationships remain in place. No production financial data or cloud resources were created by this work. Device installs, hosted Clerk/Google verification, outdoor GPS, FCM delivery and real Razorpay sandbox payments require the owner's environment and physical devices. Browser and Flutter screenshots are explicitly fixture-rendered, not physical-device captures.

## Compatibility and tests

Historical multi-store orders keep their original version-1 contracts. New server-assigned version-2 checkout always enforces one store. The historical test fixtures explicitly enable legacy creation to exercise old records, and an API regression verifies creation is disabled by default. Existing test assertions for public store fields and new checkout paths were revised for their expanded contracts; authorization checks were retained. Historical cart rendering tests explicitly use the compatibility reader, while a new-cart regression ensures older quotes cannot enable multi-store ordering.

See the evidence directory and verification report for exact counts, commands, failures and final results. Intermediate failed/aborted runs are retained separately; they are not combined into the final backend result.
