import { createHash, randomInt } from "node:crypto";
import type { TransactionSql } from "postgres";
import type { OrderSnapshot } from "@zaafran/domain/order-types";
import { getAlgiersDate } from "@zaafran/domain/hours";
import type { evaluateQuote } from "./order-quotes.js";
import { iso, orderSummaryFor, type OrderSummary } from "./order-state-store.js";

export type PricedQuote = Extract<Awaited<ReturnType<typeof evaluateQuote>>, { kind: "priced" }>;
type ReceiptKey = { customerId: string; keyHash: Buffer; requestHash: Buffer; now: Date };

export function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function readPlacementReceipt(sql: TransactionSql, key: ReceiptKey) {
  const [receipt] = await sql<{ matches: boolean; response: OrderSummary }[]>`
    SELECT request_hash = ${key.requestHash} AS matches, response FROM public.order_placement_receipts
    WHERE customer_id = ${key.customerId} AND key_hash = ${key.keyHash}
      AND created_at > ${key.now.toISOString()}::timestamptz - interval '24 hours'
  `;
  return receipt;
}

export async function savePlacementReceipt(
  sql: TransactionSql,
  key: ReceiptKey,
  order: OrderSummary,
) {
  await sql`
    INSERT INTO public.order_placement_receipts (customer_id, key_hash, request_hash, response, created_at)
    VALUES (${key.customerId}, ${key.keyHash}, ${key.requestHash}, ${JSON.stringify(order)}::jsonb, ${key.now.toISOString()})
    ON CONFLICT (customer_id, key_hash) DO UPDATE
    SET request_hash = excluded.request_hash, response = excluded.response, created_at = excluded.created_at
  `;
}

type InsertOrder = {
  order: OrderSnapshot;
  quoteId: string;
  evaluated: PricedQuote;
  payingWithDzd: number;
  confirmByPhone: boolean;
};

const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function shortCode() {
  const code = Array.from({ length: 6 }, () => alphabet.charAt(randomInt(alphabet.length))).join(
    "",
  );
  return code.slice(0, 3) + "-" + code.slice(3);
}

export async function insertOrder(sql: TransactionSql, request: InsertOrder) {
  const { order, quoteId, evaluated, payingWithDzd, confirmByPhone } = request;
  const { price, restaurantName, address, travelMinutes } = evaluated;
  const orderDay = getAlgiersDate(order.lastEventAt).isoDate;
  const placedAt = new Date(order.lastEventAt).toISOString();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = shortCode();
    const [row] = await sql`
      INSERT INTO public.orders (
        id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
        status, fulfilment, version, placed_at, last_event_at, scheduled_for, release_at,
        acceptance_deadline_at, address_snapshot, subtotal_dzd, delivery_fee_dzd, total_dzd,
        paying_with_dzd, confirm_by_phone, lines, travel_minutes
      ) VALUES (
        ${order.id}, ${quoteId}, ${order.customerId}, ${order.merchantId}, ${restaurantName}, ${code},
        ${orderDay}, ${order.status}, ${order.fulfilment}, ${order.version}, ${placedAt}, ${placedAt},
        ${iso(order.scheduledFor)}, ${iso(order.releaseAt)}, ${iso(order.acceptanceDeadlineAt)},
        ${address === null ? null : JSON.stringify(address)}::jsonb, ${price.subtotalDzd},
        ${price.deliveryFeeDzd}, ${price.totalDzd}, ${payingWithDzd}, ${confirmByPhone},
        ${JSON.stringify(price.lines)}::jsonb, ${travelMinutes}
      ) ON CONFLICT (merchant_id, order_day, short_code) DO NOTHING
      RETURNING id
    `;
    if (row) return orderSummaryFor(order, { shortCode: code, totalDzd: price.totalDzd, placedAt });
  }
  throw new Error("Could not allocate an order short code");
}

export async function readOrderPolicy(sql: TransactionSql, customerId: string | null) {
  const [row] = await sql<
    {
      cashCap: number;
      timeoutMs: number;
      hasCompleted: boolean;
      confirmByPhone: boolean;
    }[]
  >`
    SELECT
      (SELECT value::integer FROM public.platform_settings WHERE key = 'first_order_cash_cap_dzd') AS "cashCap",
      (SELECT value::integer FROM public.platform_settings WHERE key = 'order_accept_timeout_seconds') * 1000 AS "timeoutMs",
      EXISTS (SELECT FROM public.orders WHERE customer_id = ${customerId} AND status IN ('delivered', 'collected')) AS "hasCompleted",
      EXISTS (SELECT FROM public.orders WHERE customer_id = ${customerId} AND status = 'delivery_failed' LIMIT 1 OFFSET 1) AS "confirmByPhone"
  `;
  if (!row) throw new Error("Missing ordering policy");
  return row;
}
