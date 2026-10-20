# Delivery partner redesign

Duty controls now use a clear label, confirmation state and power action against a quiet high-contrast surface. The control changes only after the existing controller receives server confirmation. Persistent navigation labels keep Home, Active, Earnings and Trips identifiable.

Offers retain the server's private pool view, store pickup and locality/drop information, actual fee and claim flow. When an offer includes a server expiry, the card shows a countdown, marks expired offers and disables local acceptance after expiry. Server validation remains authoritative. No expiry or fee is invented for older responses.

Earnings use completed trips and distinguish unavailable history from zero. Copy explains that delivery fees may differ from final payouts. Active delivery retains pickup, navigation fallback, arrival, customer-code verification, lock/retry and support actions. Grocery/store language replaces kitchen and campus labels. The pipeline has readable destination labels; state still comes from the server.

Primary files: `duty_toggle.dart`, `swipe_accept_card.dart`, `earnings_card.dart`, `pipeline_stepper.dart`, `active_delivery.dart`, `driver_home.dart`, shared navigation and tokens. Automated duty/offer layouts exercise 320/360/390/430 widths at normal and doubled text size. Outdoor legibility, GPS battery behaviour and physical phone performance require device testing.
