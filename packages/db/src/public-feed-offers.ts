import type { publicRestaurantCard } from "@zaafran/contracts/feed";
import type { merchantPromotionInput } from "@zaafran/contracts/promotions";
import type { TransactionSql } from "postgres";
import { promotionAppliesOn } from "./order-offers.js";

type Promotion = ReturnType<typeof merchantPromotionInput.parse>;
type Offer = NonNullable<ReturnType<typeof publicRestaurantCard.parse>["offer"]>;

export async function readPublicOffers(sql: TransactionSql, at: Date) {
  const rows = await sql<
    { merchantId: string; discount: Promotion["discount"]; conditions: Promotion["conditions"] }[]
  >`
    SELECT offer.merchant_id AS "merchantId", offer.discount, offer.conditions
    FROM public.promotions AS offer
    JOIN public.merchants AS merchant ON merchant.id = offer.merchant_id
    WHERE merchant.status = 'active' AND NOT merchant.is_demo AND offer.is_active AND offer.code IS NULL
      AND (NOT (offer.conditions ? 'maxUsesTotal') OR
        (SELECT count(*) FROM public.promotion_redemptions AS redemption
          WHERE redemption.promotion_id = offer.id) < (offer.conditions->>'maxUsesTotal')::int)
      AND NOT coalesce((offer.conditions->>'firstOrderOnly')::boolean, false)
      AND NOT (offer.conditions ? 'maxUsesPerCustomer')
    ORDER BY offer.id
  `;
  const matches: { merchant_id: string; badge: Offer }[] = [];
  for (const { merchantId, discount, conditions } of rows) {
    if (!promotionAppliesOn(conditions, at.getTime())) continue;
    if (discount.kind === "fixed" && discount.amountDzd === 0) continue;
    if (discount.kind === "percent" && (discount.basisPoints === 0 || discount.capDzd === 0))
      continue;
    matches.push({
      merchant_id: merchantId,
      badge: { ...discount, minimumSubtotalDzd: conditions.minimumSubtotalDzd ?? 0 },
    });
  }
  return JSON.stringify(matches);
}
