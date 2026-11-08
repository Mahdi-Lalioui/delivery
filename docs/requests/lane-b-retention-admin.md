# Lane B request: contracts still missing for M6 and M7 (2026-11-08)

Lane B has built everything that has a published contract. These need contracts (and tables) from
lane A before lane B can build their screens on MSW. Shapes below are proposals.

## M6
- **CUS-23 favourites:** `PUT/DELETE /v1/me/favourites/:merchantId` (idempotent),
  `GET /v1/me/favourites` → `{ restaurants: [{ merchantId, name, slug, coverMediaId, isOpen }] }`.
- **CUS-21 history, receipt, reorder:** `GET /v1/me/orders?cursor=` (keyset),
  `GET /v1/me/orders/:orderId/receipt` (lines with options, prices, fees, totals, code, date),
  `POST /v1/me/orders/:orderId/reorder` → cart draft plus
  `{ unavailable: itemId[], priceChanges: [{ itemId, oldDzd, newDzd }] }`.
- **CUS-15 recipient:** add `recipient?: { name: string(1..80), phoneE164, shareTracking: boolean }`
  to the order placement input. Lane B's `apps/web/src/retention/recipient.tsx` produces exactly this.
- **MER-21 analytics:** `GET /v1/merchants/:merchantId/analytics?from=&to=` → totals (orders, salesDzd,
  averageTicketDzd, acceptanceRate bp, avgPrepSeconds, avgDeliverySeconds), cancellations by reason,
  topItems, heatmap `number[7][24]`, repeatCustomerRate bp; `…/analytics.csv`. TEST orders excluded (MER-25).
- **MER-13 menu photo import:** `POST /v1/merchants/:merchantId/menu-photo-imports` (behind
  `menu_photo_import`) → rows in the existing menu-import preview shape, using the fake LLM adapter in tests.

## M7
- **ADM-08 flags/settings, ADM-06 users, CUS-24 privacy export/delete, ADM-09 audit, ADM-10 support:**
  see `docs/requests/lane-b-admin-ops.md` (still open).
- **ADM-02 dashboard:** `GET /v1/admin/dashboard/today` (orders, salesDzd, acceptance, avg prep/delivery,
  cancellations by reason, unresponsive restaurants, error rate, job backlog).
