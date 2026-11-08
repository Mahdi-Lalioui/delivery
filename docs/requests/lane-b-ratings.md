# Lane B request: ratings routes and migration (M6-1, CUS-22 / MER-20)

Requested 2026-11-08. The contract is published (`packages/contracts/src/ratings.ts`). Lane B's
screens (`apps/web/src/retention/`) run on MSW handlers built from it
(`apps/web/test/mocks/ratings-handlers.ts`) until these land.

## Routes (paths lane B's client uses — keep them or tell lane B)

| Method | Path | Contract | Notes |
|---|---|---|---|
| GET | `/v1/orders/:orderId/rating` | `orderRatingOutput` | 204 when not rated yet; owner only |
| PUT | `/v1/orders/:orderId/rating` | `orderRatingInput` → `orderRatingOutput` | Idempotency-Key; 409 `edit_window_closed` after 24 h, `not_eligible` before delivery/pickup |
| GET | `/v1/restaurants/:slug/reviews` | `publicReviewPageQuery/Output` | public |
| GET | `/v1/merchants/:merchantId/reviews` | `merchantReviewPageQuery/Output` | `?stars=1..5` filters food stars |
| PUT | `/v1/merchants/:merchantId/reviews/:ratingId/reply` | `merchantReviewReplyInput/Output` | one reply, editable 24 h (409 `edit_window_closed`) |
| POST | `/v1/merchants/:merchantId/reviews/:ratingId/report` | `merchantReviewReportInput/Output` | lands in the admin queue |

## Migration
`order_ratings` (unique `order_id`, `food_stars`, `delivery_stars` null for pickup, `comment`,
`editable_until`), `rating_replies` (unique `rating_id`, `editable_until`), `rating_reports`.
Index `(merchant_id, created_at desc, id desc)` and `(merchant_id, food_stars, created_at desc, id desc)`
for keyset pages.

## Order page link
The order screen (lane A) should link to `/[locale]/orders/:orderId/rating`, adding
`?fulfilment=pickup` for pickup orders so delivery stars are not asked. The CUS-22 push 30 min
after delivery should deep-link there too.
