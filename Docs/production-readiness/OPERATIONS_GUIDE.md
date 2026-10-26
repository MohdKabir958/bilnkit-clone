# Using the readiness improvements

The existing Grozo theme, home screen and navigation are retained. These changes extend the current applications; they do not create another platform or replace the financial ledger.

## Customer

1. Save an address inside an active city/zone and choose a covered store.
2. Checkout asks the server for current prices, payment methods and capacity. An estimate cannot start payment. Online payment appears only when its provider is configured; cash appears only when the city permits it.
3. If an online attempt is still uncertain, resume the existing order. Repeated taps do not create another provider order. An operator must investigate an unresolved provider result rather than marking it paid manually.
4. If the store reports a shortage, open the item-change card in tracking. Review the complete replacement basket, price breakdown, coupon message and reduction before accepting or rejecting. A lost response retries the same decision key.
5. A cheaper accepted basket reduces cash due or requests an online partial refund. A request is not labelled processed until provider confirmation. The original capture and financial history remain intact.
6. Help and requests opens the selected private thread from support-reply notifications when FCM is configured. It also works through manual refresh when push is unavailable. It supports issue categories, private replies, reopening and private image evidence. Images must be JPEG/PNG/WebP, at most 2 MB, with valid dimensions. Evidence expires after 90 days.

## Vendor

Approval and store ownership remain mandatory. Creating an account does not approve a store. Multiple owned stores remain separate.

- Open **Store profile → packing/schedule icon** to set typical packing time, maximum simultaneous packing orders, temporary busy mode and weekly opening hours. Hours use India Standard Time. Disabled days are closed; turning scheduling off restores manual open/close control. Busy mode pauses new checkout, not responsibility for existing orders.
- Open **Store profile → performance icon** for server-calculated orders, cancellations, average accepted-to-ready time, physical-stock event reports and low-stock alerts. Reports cover 7/30/90 days. Low-stock alerts are in-app; this is not a claim of Firebase notification delivery.
- Inventory retains add/edit, approval status, rejection/resubmission, barcode/SKU lookup and stock history. Physical inventory adds lots, expiry warnings, packing and return inspection.
- Record missing, damaged and expired packs accurately. A cancelled packed order requires inspection; it is not automatically returned to sale. A shortage proposal records removed missing packs even if the customer later rejects the alternative.
- Propose a full alternative basket from the order. Same-price/cheaper alternatives and quantity reductions are supported. Higher charges require a separate customer payment design and are rejected here. Do not substitute without customer approval.

## Delivery partner

Only approved, on-duty, eligible riders receive offers. Offer expiry and first successful acceptance are controlled by the server. The assigned rider receives pickup/drop-off details and packing information.

Refresh GPS after restoring permissions or resuming the app. Poor accuracy, old/replayed fixes and impossible movement are rejected with recovery guidance. A rider cannot bypass location checks. Exceptional pickup/drop-off proof requires a detailed request and approval by a different administrator, expires after 15 minutes and applies only to its specified stage. The delivery code and cash confirmation remain mandatory.

## Administrator

- **Operations:** review actionable exceptions, assign an owner, check SLA deadlines and record reasons/evidence for recovery. Expired rider-search recovery escalates for a deliberate assignment/cancellation decision; it does not promise an available rider.
- **Inventory:** inspect physical stock/lots, including missing packs and returns. Product ownership and approval rules are enforced by the backend.
- **Cash:** compare collected cash with independently received platform remittances. Record unique receipt references, partial receipts, disputes and outstanding balances. Daily closing needs a second reviewer. Financial evidence is append-only.
- **Support:** categorize, prioritize and assign requests; add private notes/evidence and resolve/reopen cases. Evidence URLs require case authorization and are not public product images.
- **Vendor compliance:** verify operator-provided seller/GST/FSSAI applicability and documents. A saved field is not professional legal approval.
- **Finance:** check payout holds from refunds, adjustments, support disputes, reconciliation and COD. Manual paid confirmation needs independently verified payment evidence and a unique reference. The sandbox adapter sends no money; no live disbursement adapter is enabled.
- **Jobs/diagnostics:** expand “Platform job health and seller reminders” on Operations. View recent runs, last success, attempts and next eligibility; FSSAI reminders show the next 30 days and overdue licences without changing approval. Inspect schema/storage readiness and durable jobs. Retry a failed/dead job with a reason after investigating. An active lease cannot be forcibly duplicated through the retry endpoint.

Existing Clerk authentication, server roles, resource ownership, Socket.io room checks, FCM ownership, Razorpay signatures and delivery-code verification remain in place. Production authentication mode is not changed by applying source changes alone.
