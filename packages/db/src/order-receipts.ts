import {
  readOrderHistoryCursor,
  type customerOrderHistoryOutput,
  type customerOrderHistoryQuery,
  type customerOrderReceiptOutput,
} from "@zaafran/contracts/retention";
import type { ISql } from "postgres";
import type { PricedQuote } from "./order-placement-store.js";
import { activeStandardSession } from "./standard-session.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Receipt = ReturnType<typeof customerOrderReceiptOutput.parse>;
type StoredReceipt = Omit<Receipt, "placedAt" | "lines" | "discountDzd"> & {
  placedAt: Date;
  lines: PricedQuote["price"]["lines"];
};

function presentLine({
  itemId,
  names,
  unitPriceDzd,
  quantity,
  options,
}: StoredReceipt["lines"][number]) {
  return {
    itemId,
    names,
    unitPriceDzd,
    quantity,
    options: options.map(({ optionId, names, priceDeltaDzd }) => ({
      optionId,
      names,
      priceDeltaDzd,
    })),
    lineTotalDzd:
      quantity * options.reduce((sum, option) => sum + option.priceDeltaDzd, Number(unitPriceDzd)),
  };
}

export async function readCustomerOrderReceipts(
  sql: ISql,
  customerId: string,
  orderId?: string,
): Promise<Receipt[]> {
  const rows = await sql<StoredReceipt[]>`
    SELECT id AS "orderId", merchant_id AS "merchantId", restaurant_name AS "restaurantName",
      short_code AS "shortCode", status, fulfilment, total_dzd AS "totalDzd", placed_at AS "placedAt",
      subtotal_dzd AS "subtotalDzd", delivery_fee_dzd AS "deliveryFeeDzd", lines
    FROM public.orders WHERE customer_id = ${customerId}
    ${orderId ? sql`AND id = ${orderId}` : sql``}
    ORDER BY placed_at DESC, id DESC
  `.parsers(timestampParsers);
  return rows.map(({ placedAt, lines, ...receipt }) => ({
    ...receipt,
    placedAt: placedAt.toISOString(),
    lines: lines.map(presentLine),
    discountDzd: 0,
  }));
}

type HistoryPage = ReturnType<typeof customerOrderHistoryOutput.parse>;
export type OrderHistoryQuery = ReturnType<typeof customerOrderHistoryQuery.parse>;
export type CustomerOrderScope = { customerId: string; sessionId: string };

export async function isActiveCustomer(sql: ISql, { customerId, sessionId }: CustomerOrderScope) {
  const [session] = await sql<{ active: boolean }[]>`
    SELECT ${activeStandardSession(sql, { userId: customerId, sessionId })} AS active
  `;
  return session?.active === true;
}

export async function readCustomerOrderHistory(
  sql: ISql,
  customerId: string,
  query: OrderHistoryQuery,
): Promise<HistoryPage> {
  const cursor = query.cursor === undefined ? undefined : readOrderHistoryCursor(query.cursor);
  const rows = await sql<HistoryPage["orders"]>`
    SELECT purchase.id AS "orderId", purchase.merchant_id AS "merchantId",
      purchase.restaurant_name AS "restaurantName", merchant.slug AS "restaurantSlug",
      purchase.short_code AS "shortCode", purchase.status, purchase.fulfilment,
      purchase.total_dzd AS "totalDzd",
      to_char(purchase.placed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "placedAt"
    FROM public.orders AS purchase
    LEFT JOIN public.merchants AS merchant ON merchant.id = purchase.merchant_id
      AND merchant.status = 'active' AND NOT merchant.is_demo
    WHERE purchase.customer_id = ${customerId}
      ${cursor ? sql`AND (purchase.placed_at, purchase.id) < (${cursor.placedAt}::timestamptz, ${cursor.orderId}::uuid)` : sql``}
    ORDER BY purchase.placed_at DESC, purchase.id DESC LIMIT ${query.limit + 1}
  `;
  const orders = rows.slice(0, query.limit);
  const last = orders.at(-1);
  return {
    orders,
    nextCursor: rows.length > query.limit && last ? `${last.placedAt}~${last.orderId}` : null,
  };
}
