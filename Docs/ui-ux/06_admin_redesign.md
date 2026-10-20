# Admin portal redesign

A light Grozo operations shell replaces the dark console. Navigation groups operations, commerce and administration. The overview is the default destination; internal tab IDs are unchanged. Mobile navigation traps focus, closes with Escape and restores the previous focus. Header search only appears for destinations that support it.

The overview prioritises orders, active deliveries, paid sales and open requests. Secondary network and financial metrics remain available in a compact health panel. Labels distinguish period-scoped order metrics from platform-wide requests. Dispatch, support replies and audit retain their real APIs and actions; no sample metrics are rendered as production data.

Inventory has contained product media, readable pricing/pack/stock/approval hierarchy, filters, pagination and action controls. Product editing, stock adjustment and history use the existing accessible drawer with focus handling. Failed changes remain visible and retry keys/version checks are retained. Store, order, delivery, finance, catalog, category and coverage screens inherit the lighter surfaces, readable tokens, restrained radii, fields and table styling. User-entered names and historical records stay intact.

Browser captures use Chromium connected to the actual local API and persisted pilot catalog. Desktop widths exercised: 1024/1280/1440/1920. Detailed screen, keyboard, build and regression outcomes belong in `07_visual_qa.md`.

Primary files: `App.tsx`, `Sidebar.tsx`, `Header.tsx`, `OperationsPanel.tsx`, `InventoryPanel.tsx`, `ProductImage.tsx`, `LoginScreen.tsx`, `index.css`, Tailwind/token configuration and presentation helpers. API route/field names, enums and legacy CSV aliases remain compatible.
