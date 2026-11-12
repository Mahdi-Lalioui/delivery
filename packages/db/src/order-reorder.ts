import type { customerReorderOutput } from "@zaafran/contracts/retention";
import { priceCashQuote } from "@zaafran/domain/order-quote";
import type { TransactionSql } from "postgres";
import { readItemOptionGroups } from "./menu-option-group-queries.js";
import type { PricedQuote } from "./order-placement-store.js";
import { readVisibleItem } from "./public-restaurant-items.js";

type Reorder = ReturnType<typeof customerReorderOutput.parse>;
type PurchasedLine = PricedQuote["price"]["lines"][number];
type Purchase = {
  merchantId: string;
  restaurantSlug: string;
  menuRevision: number;
  lines: PurchasedLine[];
};

async function currentLine(
  sql: TransactionSql,
  { merchantId, now }: { merchantId: string; now: Date },
  line: PurchasedLine,
) {
  const target = { merchantId, itemId: line.itemId };
  const item = await readVisibleItem(sql, { ...target, now });
  if (!item?.isAvailable) return undefined;
  const groups = await readItemOptionGroups(sql, target);
  const optionIds = line.options.map(({ optionId }) => optionId);
  const price = priceCashQuote({
    lines: [{ item, groups, optionIds, quantity: line.quantity }],
    minimumDzd: 0,
    fulfilment: { kind: "pickup" },
  });
  if (!price.ok) return undefined;
  return {
    item: { itemId: line.itemId, quantity: line.quantity, optionIds },
    oldDzd: line.options.reduce(
      (sum, option) => sum + option.priceDeltaDzd,
      Number(line.unitPriceDzd),
    ),
    newDzd: price.value.subtotalDzd / line.quantity,
  };
}

export async function readCustomerReorder(
  sql: TransactionSql,
  { customerId, orderId, now }: { customerId: string; orderId: string; now: Date },
): Promise<Reorder | undefined> {
  const [purchase] = await sql<Purchase[]>`
    SELECT merchant.id AS "merchantId", merchant.slug AS "restaurantSlug",
      merchant.menu_revision::double precision AS "menuRevision", purchase.lines
    FROM public.orders AS purchase
    JOIN public.merchants AS merchant ON merchant.id = purchase.merchant_id
    WHERE purchase.id = ${orderId} AND purchase.customer_id = ${customerId}
      AND purchase.status IN ('delivered', 'collected', 'cancelled', 'rejected', 'expired')
      AND merchant.status = 'active' AND NOT merchant.is_demo
  `;
  if (!purchase) return undefined;
  const { merchantId, restaurantSlug, menuRevision, lines } = purchase;
  const result: Reorder = {
    draft: { merchantId, restaurantSlug, menuRevision, items: [] },
    unavailable: [],
    priceChanges: [],
  };
  const unavailable = new Set<string>();
  const current = await Promise.all(
    lines.map((line) => currentLine(sql, { merchantId, now }, line)),
  );
  for (const [index, original] of lines.entries()) {
    const line = current[index];
    if (!line) {
      unavailable.add(original.itemId);
      continue;
    }
    const { item, oldDzd, newDzd } = line;
    result.draft.items.push(item);
    if (oldDzd !== newDzd) result.priceChanges.push({ itemId: item.itemId, oldDzd, newDzd });
  }
  result.unavailable = [...unavailable];
  return result;
}
