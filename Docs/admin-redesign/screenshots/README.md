# Admin redesign screenshots

Actual Chromium captures of the implemented React components with synthetic local API fixtures. The visible banner distinguishes them from hosted sessions. These are not physical-device captures, live marketplace data or proof of provider authentication. Login shows the real implemented recovery state because provider access is blocked here.

| View | Capture |
| --- | --- |
| Overview and quick tasks | [Overview](01-overview.png) |
| View all vendors | [Vendors](02-vendors.png) |
| Create a vendor | [Add vendor](03-add-vendor.png) |
| City setup | [Cities](04-cities.png) |
| Delivery zones | [Zones](05-delivery-zones.png) |
| Team roles | [Team & access](06-team-access.png) |
| Email grant | [Add administrator](07-add-admin-email.png) |
| Grocery inventory | [Products & stock](08-products-stock.png) |
| Add grocery product | [Add product](09-add-product.png) |
| Narrow viewport | [Mobile overview](10-mobile-overview.png) |
| Branded login recovery | [Login recovery](11-login-recovery.png) |

Reproduce from repository root in two terminals:

```sh
node scripts/ui_ux/admin-redesign/server.mjs
node scripts/ui_ux/admin-redesign/capture.mjs
```

The server binds localhost only. Its entry patches API methods solely in this standalone fixture module, outside the production entrypoint. It contains no provider credentials and changes no database. Production Vite configuration does not import the harness. The login view loads the actual Clerk SDK and records its network failure. See `manifest.json` for viewports, overflow checks and the expected provider error.
