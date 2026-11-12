# Lane B → lane A: data to finish one-tap reorder

Status: open (2026-11-12)

Today reorder stops half way. `POST /v1/me/orders/{orderId}/reorder` returns a draft
(`itemId`, `quantity`, `optionIds`) plus unavailable items and price changes, and
`apps/web/src/retention/my-orders.tsx` shows that summary, but its "Continue to cart" button is
permanently disabled (`TODO(M6-2)`). The customer cart lives in the browser
(`zaafran.customer-cart.v1`, `@zaafran/domain/cart`), and a cart line needs each item's current
names, price and option groups. Lane B can build those lines exactly as the dish sheet does
(`readRestaurantItem` → `configureCartLine`), but the public item route is
`/v1/merchants/{slug}/items/{itemId}?expectedRevision=…`, and nothing the customer has carries the
restaurant's **slug**:

- `customerOrderHistoryOutput.orders[]` has `merchantId` and `restaurantName`, no slug;
- `customerReorderOutput.draft` has `merchantId`, no slug.

Request (either is enough; contracts and API are lane A's):

1. add `restaurantSlug` to the order summary and to `customerReorderOutput.draft`; or
2. return the reorder draft already priced as cart lines (names, unit price, selected option
   names and deltas, the menu revision), so the web app only saves it.

With that, lane B will:

- make "Continue to cart" fill the browser cart and open the restaurant page with the cart bar
  showing, keeping the unavailable-items and price-change notices; and
- add an "Order again" rail to the home feed (last three completed orders) with a one-tap button.
