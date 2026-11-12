# Lane B → lane A: data to finish one-tap reorder

Status: Lane A API implemented (2026-11-12). Lane B cart integration remains open.

Reorder still stops at the browser summary. `POST /v1/me/orders/{orderId}/reorder` now returns a live draft
(`itemId`, `quantity`, `optionIds`) plus unavailable items and price changes, and
`apps/web/src/retention/my-orders.tsx` shows that summary, but its "Continue to cart" button is
permanently disabled (`TODO(M6-2)`). The customer cart lives in the browser
(`zaafran.customer-cart.v1`, `@zaafran/domain/cart`), and a cart line needs each item's current
names, price and option groups. Lane B can build those lines exactly as the dish sheet does
(`readRestaurantItem` → `configureCartLine`), but the public item route is
`/v1/merchants/{slug}/items/{itemId}?expectedRevision=…`, and the original request needed a way to resolve the restaurant’s slug:

- `customerOrderHistoryOutput.orders[]` previously had only `merchantId` and `restaurantName`.
- `customerReorderOutput.draft` previously had only `merchantId` for the restaurant.

Request (either is enough; contracts and API are lane A's):

1. add `restaurantSlug` to the order summary and to `customerReorderOutput.draft`; or
2. return the reorder draft already priced as cart lines (names, unit price, selected option
   names and deltas, the menu revision), so the web app only saves it.

With that, lane B will:

- make "Continue to cart" fill the browser cart and open the restaurant page with the cart bar
  showing, keeping the unavailable-items and price-change notices; and
- add an "Order again" rail to the home feed (last three completed orders) with a one-tap button.


## API handoff

Use `draft.restaurantSlug` and `draft.menuRevision` as the item route’s slug and
`expectedRevision`. History supplies `restaurantSlug` for the Order again rail, or `null`
when the restaurant has no public page. Use the draft fields when opening a menu since
the restaurant can change its slug or menu between history and reorder.

Reorder reads the signed-in customer’s own delivered, collected, cancelled, rejected or
expired order at a public restaurant. Missing or ineligible orders return 404. The draft contains the original quantities and
selections that still pass current menu rules. `priceChanges` compares configured prices per
unit. Reorder leaves the cart and order unchanged. The cart still goes through the normal
quote at checkout.

## Lane B cart integration (2026-11-12)

"Continue to cart" on My orders now rebuilds the draft in the browser cart from the live menu
(`readRestaurantItem` with `draft.restaurantSlug` and `draft.menuRevision`), skips dishes or
choices that no longer pass the menu rules, asks before replacing another restaurant's cart,
and opens the restaurant page with the cart bar. A `null` slug shows "not taking online orders".
The "Order again" home rail is next.
