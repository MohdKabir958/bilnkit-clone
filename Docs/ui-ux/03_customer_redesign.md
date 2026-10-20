# Customer redesign

Home now leads with serviceable grocery products, managed categories and search. Each card shows its actual store, pack size, price, valid MRP saving, availability and quantity. Store cards follow the product grid. Address selection still clears the previous address's catalog and reloads serviceability. First-order promotions retain the existing eligibility check.

The store catalog uses the same lazy product grid, real category filters and price/availability sorting. Missing imagery has an explicit package fallback; ratings render only when supplied. The arbitrary 4.5 rating default was removed. The product sheet has contained media, real SKU variants, stock-bounded quantities and a fixed purchase footer. Home and catalog share the stock/cart/customisation action, preserving confirmations and store limits.

The cart summary displays items subtotal and directs customers to checkout for fees. Cart and checkout lines show actual product images or placeholders. Existing server quotes, payment retries, idempotency, address checks, coupons, multi-store totals and post-payment tracking remain connected. Tracking language describes picking, packing and doorstep delivery.

Accessibility: stable labelled navigation, larger quantity controls, system text scaling, quieter animation and semantic missing-image states. Automated card layouts cover 320/360/390/430 widths and 1/1.3/2 text scales. Renderer screenshots use isolated grocery fixtures; see visual QA for the precise verification outcome.

Primary files: `home_screen.dart`, `dhaba_menu_screen.dart`, `product_card.dart`, `product_details.dart`, `cart_actions.dart`, `cart_summary_bar.dart`, `cart_sheet.dart`, `checkout_screen.dart`, `live_tracking_screen.dart`, shared tokens and `DhabaProvider`.

Performance: lazy sliver builders and bounded image decoding remain in use. Initial discovery keeps the API's first product page rather than downloading every product page. Explicit load-more controls and debounced API searches by product name/SKU retrieve further results, with at most three store requests at once. Address and query generations discard stale responses. The serviceable store list is still fully fetched. No startup-time or frame-rate improvement is claimed without device measurements.
