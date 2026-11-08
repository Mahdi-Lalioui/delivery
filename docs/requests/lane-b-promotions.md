# Lane B request: promotions routes, list envelope and migration (M6-3, MER-19 / CUS-16)

Requested 2026-11-08. `packages/contracts/src/promotions.ts` has the input/output shapes. Lane B's
editor (`apps/web/src/retention/promotions-editor.tsx`) runs on MSW
(`apps/web/test/mocks/promotions-handlers.ts`) until these land.

## Contract addition
- A list output. Lane B currently parses a bare JSON array of `merchantPromotionOutput` (≤ 100).
  Prefer `merchantPromotionListOutput = z.strictObject({ promotions: z.array(merchantPromotionOutput).max(100) })`;
  tell lane B and it will switch.

## Routes
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/v1/merchants/:merchantId/promotions` | → list | owner/manager |
| POST | `/v1/merchants/:merchantId/promotions` | `merchantPromotionInput` → `merchantPromotionOutput` (201) | Idempotency-Key; 409 when the code is already used by this merchant |
| PUT | `/v1/merchants/:merchantId/promotions/:promotionId` | same → 200 | keeps stats |

## Migration
`promotions` (merchant-scoped, unique `(merchant_id, lower(code))` where code not null, discount
and conditions columns, `is_active`), `promotion_redemptions` (order_id unique, customer_id) for
`maxUsesTotal`/`maxUsesPerCustomer` and the stats (uses, sales DZD).

## Still to do in lane B
Weekly days/hours conditions (`conditions.weekly`) are not in the editor yet; they will reuse the
merchant-hours week editor.

## Short link for shareables (MER-24)
Lane B's QR posters (`apps/web/src/retention/share-kit.tsx`) print `/r/:merchantId`. Please add a
public route that redirects `/r/:merchantId` to the restaurant page (and a `slug` in the merchant
contract if you want prettier links; lane B will switch).
