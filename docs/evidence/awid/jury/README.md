# Final jury round: every customer screen (lane B, 2026-11-13)

Bar: the first ten seconds on each screen must feel as clear, calm and finished as the best
delivery and consumer apps (one obvious next action, nothing broken or clipped, both scripts
and both themes treated as first-class).

Matrix: 14 screens (landing, discovery, pickup, restaurant, sign-in, account, checkout,
payment, confirmed, tracking, waiting, pickup tracking, rating, orders) × ar-390, fr-390,
fr-1280, fr-390-dark, on a production preview build
(`pnpm evidence:screens http://127.0.0.1:3110 docs/evidence/awid/jury/round-N`).
States are judged separately in [states](../states/README.md).

## Round 1: what fell short

| # | Screen / variant | Shortfall | Fix |
|---|---|---|---|
| 1 | Orders, all variants | Favourites rail showed only a sliver of the third tile, reading as a clipping bug | Columns sized to show two tiles and 0.4 of the third |
| 2 | Orders, ar-390 | Latin restaurant names ellipsized at the wrong end ("rantika Bab El Oued") | `dir="auto"` on each name |
| 3 | Orders, real route | No tab bar, although "Commandes" is a tab (Home, Search and Profile have it) | Tab bar added on `/orders` |
| 4 | Rating, fr-390 | "Envoyer la note" half under the tab bar in the design build; the real route has no tab bar | Design build mirrors the real routes (rating is a task flow) |
| 5 | Pickup tracking, fr-1280 | Card stranded on the left, half the page empty (no map for pickup) | One centred 32 rem column on desktop when there is no map |
| – | Account and sign-in, preview | "Vos infos de connexion ne s'affichent pas" | Preview limitation: the preview build has no auth API. Signed-out visitors on a real API get the sign-in prompt (401 → `sign-in` branch). Not a product change. |

Round 1 captures: `round-1/` (sheets `sheet-{ar-390,fr-390,fr-1280,fr-390-dark}.jpg`).

## Round 2: after the fixes

All five shortfalls checked again on a fresh production build (`round-2/`, sheets
`sheet-{ar-390,fr-390,fr-1280,fr-390-dark}.jpg`):

- Orders: two tiles and a clear peek of the third; names end in an ellipsis in both scripts;
  tab bar present.
- Rating: "Envoyer la note" fully visible above the fold at fr-390 (task flow, no tab bar).
- Pickup tracking, fr-1280: one centred column.
- No overflow, clipping, wrong-direction text or contrast problem found on any of the 56
  captures. Accessibility for the same routes is proven separately (0 axe violations,
  0 targets under 44 px, 0 invisible focus): [a11y](../a11y/README.md).

Nothing left that falls short in this round. The only remaining notice (account and sign-in
messages) is the preview build's missing auth API, not the product.
