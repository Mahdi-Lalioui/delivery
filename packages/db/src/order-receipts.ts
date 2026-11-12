import type { customerOrderReceiptOutput } from "@zaafran/contracts/retention";
import type { ISql } from "postgres";
import type { PricedQuote } from "./order-placement-store.js";
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

export async function readCustomerOrderReceipts(sql: ISql, customerId: string): Promise<Receipt[]> {
  const rows = await sql<StoredReceipt[]>`
    SELECT id AS "orderId", merchant_id AS "merchantId", restaurant_name AS "restaurantName",
      short_code AS "shortCode", status, fulfilment, total_dzd AS "totalDzd", placed_at AS "placedAt",
      subtotal_dzd AS "subtotalDzd", delivery_fee_dzd AS "deliveryFeeDzd", lines
    FROM public.orders WHERE customer_id = ${customerId}
    ORDER BY placed_at DESC, id DESC
  `.parsers(timestampParsers);
  return rows.map(({ placedAt, lines, ...receipt }) => ({
    ...receipt,
    placedAt: placedAt.toISOString(),
    lines: lines.map(presentLine),
    discountDzd: 0,
  }));
}
