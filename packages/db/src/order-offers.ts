import type {
  merchantPromotionInput,
  quotePromotionRejectionCode,
} from "@zaafran/contracts/promotions";
import { getAlgiersDate, isOpenAt } from "@zaafran/domain/hours";
import { dzd, type Dzd } from "@zaafran/domain/money";
import { type priceOrder, selectOrderOffer } from "@zaafran/domain/pricing";
import type { TransactionSql } from "postgres";

type Promotion = ReturnType<typeof merchantPromotionInput.parse>;
type Rejection = ReturnType<typeof quotePromotionRejectionCode.parse>;
type Promo = NonNullable<Parameters<typeof priceOrder>[0]["promo"]>;
type Candidate = {
  id: string;
  discount: Promotion["discount"];
  conditions: Promotion["conditions"];
  isActive: boolean;
  totalUses: number;
  customerUses: number;
  hasOrdered: boolean;
};
type OfferRequest = {
  merchantId: string;
  customerId: string;
  code?: string | undefined;
  at: Date;
  price: { subtotalDzd: Dzd; deliveryFeeDzd: Dzd };
};

function amount(value: number) {
  const result = dzd(value);
  if (!result.ok) throw new Error("Invalid stored offer amount");
  return result.value;
}

function pricingOffer(discount: Promotion["discount"]): Promo {
  switch (discount.kind) {
    case "fixed":
      return { ...discount, amountDzd: amount(discount.amountDzd) };
    case "percent":
      return { ...discount, capDzd: amount(discount.capDzd) };
    case "free_delivery":
      return discount;
  }
}

function appliesOn(conditions: Promotion["conditions"], at: number) {
  const { startsOn, endsOn, weekly } = conditions;
  const date = getAlgiersDate(at).isoDate;
  if ((startsOn && date < startsOn) || (endsOn && date > endsOn)) return false;
  return (
    weekly === undefined ||
    isOpenAt({
      hours: { weekly: Object.fromEntries(weekly.map(({ weekday, ranges }) => [weekday, ranges])) },
      at,
    })
  );
}

function limitReached(row: Candidate) {
  const { firstOrderOnly, maxUsesTotal, maxUsesPerCustomer } = row.conditions;
  return (
    (firstOrderOnly === true && row.hasOrdered) ||
    row.totalUses >= (maxUsesTotal ?? Infinity) ||
    row.customerUses >= (maxUsesPerCustomer ?? Infinity)
  );
}

function rejection(row: Candidate, request: OfferRequest): Rejection | undefined {
  const { conditions } = row;
  if (!row.isActive || !appliesOn(conditions, request.at.getTime())) return "promotion_expired";
  if (request.price.subtotalDzd < (conditions.minimumSubtotalDzd ?? 0))
    return "promotion_below_minimum";
  if (limitReached(row)) return "promotion_used_up";
  return undefined;
}

export async function evaluateOrderOffer(sql: TransactionSql, request: OfferRequest) {
  const { merchantId, customerId, code = null } = request;
  const candidates = await sql<Candidate[]>`
    SELECT offer.id, offer.discount, offer.conditions, offer.is_active AS "isActive",
      usage.total AS "totalUses", usage.customer AS "customerUses",
      EXISTS (SELECT FROM public.orders WHERE customer_id = ${customerId}) AS "hasOrdered"
    FROM public.promotions AS offer
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE redemption.customer_id = ${customerId})::int AS customer
      FROM public.promotion_redemptions AS redemption WHERE redemption.promotion_id = offer.id
    ) AS usage
    WHERE offer.merchant_id = ${merchantId}
      AND CASE WHEN ${code}::text IS NULL THEN offer.code IS NULL AND offer.is_active
        ELSE lower(offer.code) = lower(${code}) END
  `;
  if (code !== null) {
    const row = candidates[0];
    if (!row) return { kind: "promotion_wrong_restaurant" } as const;
    const reason = rejection(row, request);
    return reason
      ? { kind: reason }
      : { kind: "eligible" as const, offer: { id: row.id, promo: pricingOffer(row.discount) } };
  }
  const offers = candidates
    .filter((row) => rejection(row, request) === undefined)
    .map(({ id, discount }) => ({ id, promo: pricingOffer(discount) }));
  return { kind: "eligible" as const, offer: selectOrderOffer(request.price, offers) };
}
