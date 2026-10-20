# Vendor redesign

The main product destination now opens the grocery SKU inventory rather than the old meal stock screen. Inventory uses product thumbnails, price/pack hierarchy, approval and availability labels, loaded-product counts, low-stock/out-of-stock/pending filters, debounced search and existing server pagination. Counts explicitly cover loaded products. Actions retain edit/variants, stock adjustment, history and archive confirmation.

Product forms group identification, pricing, product information, tax, imagery and stock settings. Existing exact paise conversion, required categories, versioned stock updates and retry idempotency remain. The store availability control is compact and readable. First-run guidance, paid-order queue, cancellation notices and order actions remain connected. Earnings stay derived from actual loaded orders; incomplete history is labelled. The payout reminder participates in the earnings scroll view so enlarged text does not force it outside a fixed column.

Shared typography, persistent navigation labels, restrained surfaces and a bundled Hindi fallback improve consistency. The app no longer caps text scaling at 1.3. Grocery inventory layouts exercise 320/360/390/430 widths at normal and doubled text size.

Primary files: `vendor_home.dart`, `product_inventory_screen.dart`, `store_status_hero.dart`, `big_nav.dart`, `sales_analytics.dart`, shared theme and user-facing screen/widget copy. Legacy controller/class names and endpoints stay compatible.
