# Reduce: one focal point per screen (lane B, 2026-11-12)

Method: every customer screen captured at fr-390 on a production preview build
(`pnpm evidence:screens`), first viewport and full page; for each screen I named the one next
action and asked of every other element whether it helps that action.

| Screen | Focal point (next action) | Verdict |
|---|---|---|
| Landing | "Trouver à manger" | Kept. "Aperçu équipe" appears only in preview builds. |
| Discovery | Search field under "Une petite faim ?" | **Cut**: five curated rails before the list repeated the same 8 restaurants up to four times. Now Favourites, Nearby (with an address), Top rated and New only; free delivery, fastest and ≤ 1 000 DA stay one tap away in filters and sort; a rail with fewer than three restaurants hides itself. |
| Pickup | Map pins → restaurant | Kept: map, then the same list. |
| Restaurant | Dish "+" | Kept: cover, one info card, Popular, menu. |
| Checkout (3 steps) | "Continuer" / "Commander · total" | Kept: one primary per step, no tab bar. |
| Confirmed | "Suivre ma commande" | Kept: single action. |
| Tracking / waiting | Arrival time | Kept: map, ETA card, timeline, code, call buttons below the fold. |
| Pickup tracking | Pickup code | Kept. |
| Rating | Stars then "Envoyer la note" | Kept. |
| Orders | "Recommander" | Kept; favourites tile clipping goes to the jury round. |
| Account, sign-in | List rows / sign-in form | Kept. |

Before: [first viewports](before-fr-390-first-viewports.png), [Discovery full page](before-discover-full.png).
After: [Discovery full page](after-discover-full.png) (5 283 px → 4 289 px of scrolling, two rails before the list).
