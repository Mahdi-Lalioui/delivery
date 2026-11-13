# Every state of every customer screen (lane B, 2026-11-13)

Production preview build. Each state captured at ar-390, fr-390, fr-1280 and fr-390-dark
(116 captures). Contact sheets: [fr-390](contact-sheet-fr-390.jpg),
[ar-390](contact-sheet-ar-390.jpg), [fr-1280](contact-sheet-fr-1280.jpg),
[fr-390-dark](contact-sheet-fr-390-dark.jpg).

- Live routes with a staged network: `pnpm evidence:live-states <baseUrl> <outDir>`
  (Playwright intercepts `/v1/feed` and `/v1/merchants/**`; slow network is Chrome's Slow 3G).
- Fixture states in the design build: `pnpm evidence:screens <baseUrl> <outDir> <state …>`.

| Requested state | Screen(s) | Capture prefix | Design |
|---|---|---|---|
| Loading | Discovery, restaurant, checkout, tracking, orders, rating | `*-loading` | Skeletons in the final layout; no spinners, no jump when content lands |
| Empty | Discovery (no restaurants; no match for filters), checkout (empty basket), orders | `discover-empty`, `discover-filtered-empty`, `checkout-empty`, `orders-empty` | Illustration, one sentence, one action; filters offer "Retirer …" per filter and "Tout effacer" |
| Error | Discovery, restaurant, checkout total, tracking, orders, rating | `*-error` | What happened + "Réessayer"; checkout's button drops the missing total ("Commander") |
| Offline | Any page without a network | `offline` | Branded offline page with "Réessayer" |
| Slow network | Discovery, restaurant | `slow-network-*` | Skeletons and photo placeholders hold the layout |
| Closed restaurant | Restaurant | `restaurant-closed` | "Fermé" badge, a note, and the opening hours open by default (Friday shows "Fermé") |
| Sold-out dish | Restaurant menu | `restaurant-sold-out` | Dimmed card, "Épuisé" badge, disabled add |
| Expired cart | Checkout | `checkout-expired-cart` | "Votre panier a expiré" naming the restaurant and why (7 days, prices) |
| Offer no longer valid | Checkout | `checkout-promo-rejected` | Code dropped, basket re-quoted, field says why and what to try |
| Cancelled / rejected / no answer / delivery failed | Tracking | `tracking-cancelled`, `-rejected`, `-expired`, `-delivery-failed` | No live map, no future steps: what happened, "Rien à payer", "Trouver un autre restaurant" / "Voir mes commandes"; failed delivery keeps "Appeler le restaurant" |
| Not found | Tracking | `tracking-not-found` | "Voir mes commandes" |
| Delivered | Tracking | `tracking-delivered` | Full timeline and "Noter" |

## Flaws found in review and fixed

1. Ended orders still showed the live map and unreached steps → new ended view.
2. Checkout's button read "Commander ·" with no total → "Commander".
3. The promo link showed while the total failed → hidden until a quote exists.
4. Orders said "Aucun favori" while orders were loading or failing → favourites follow the page.
5. Rating load error used the save-error text and had no retry → load copy + "Réessayer".
6. Tracking "not found" had no way out → "Voir mes commandes".
7. An expired cart looked like an empty basket → it now says so.
8. Closed restaurant gave no hours → note + hours open; 24-hour ranges read "Ouvert 24 h/24"
   instead of "00:00–00:00"; the preview's "opens on" date no longer lies in the past.
