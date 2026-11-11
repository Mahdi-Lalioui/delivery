import type { orderQuoteInput, orderQuoteOutput } from "@zaafran/contracts/orders";
import { priceCashQuote } from "@zaafran/domain/order-quote";
import type { ISql, TransactionSql } from "postgres";
import type { z } from "zod";
import type { DatabaseConnection } from "./database.js";
import { readItemOptionGroups } from "./menu-option-group-queries.js";
import {
  readDeliveryZone,
  readOrderMerchant,
  resolveQuoteSlot,
} from "./order-quote-availability.js";
import { readVisibleItem } from "./public-restaurant-items.js";

type QuoteInput = z.infer<typeof orderQuoteInput>;
type Quote = z.infer<typeof orderQuoteOutput>;
export type QuoteRequest = { customerId: string; input: QuoteInput; now: Date };
type PriceInput = Parameters<typeof priceCashQuote>[0];

const quoteLifetimeMs = 600_000;

async function readQuoteLines(sql: TransactionSql, input: QuoteInput, at: Date) {
  const merchantId = input.merchantId.toLowerCase();
  const ids = [...new Set(input.items.map(({ itemId }) => itemId.toLowerCase()))];
  const entries = await Promise.all(
    ids.map(async (itemId) => {
      const target = { merchantId, itemId };
      const item = await readVisibleItem(sql, { ...target, now: at });
      if (!item?.isAvailable) return [itemId, undefined] as const;
      const groups = await readItemOptionGroups(sql, target);
      return [itemId, { item, groups }] as const;
    }),
  );
  const menu = new Map(entries);
  const lines: PriceInput["lines"][number][] = [];
  for (const item of input.items) {
    const current = menu.get(item.itemId.toLowerCase());
    if (!current) return undefined;
    lines.push({
      ...current,
      quantity: item.quantity,
      note: item.note ?? "",
      optionIds: item.optionIds.map((id) => id.toLowerCase()),
    });
  }
  return lines;
}

async function resolveQuoteFulfilment(
  sql: TransactionSql,
  request: QuoteRequest,
  merchant: NonNullable<Awaited<ReturnType<typeof readOrderMerchant>>>,
) {
  const { customerId, input } = request;
  if (input.fulfilment === "pickup") {
    if (!merchant.pickupEnabled) return { kind: "fulfilment_unavailable" } as const;
    return {
      kind: "available",
      minimumDzd: merchant.pickupMinimumDzd,
      travelMinutes: 0,
      address: null,
      fulfilment: { kind: "pickup" },
    } as const;
  }
  if (!merchant.deliveryEnabled) return { kind: "fulfilment_unavailable" } as const;
  const address = await readDeliveryZone(sql, {
    customerId,
    merchantId: merchant.merchantId,
    addressId: input.addressId,
  });
  if (!address) return { kind: "address_not_found" } as const;
  if (!address.zone) return { kind: "outside_delivery_zone" } as const;
  const { feeDzd, minimumDzd, travelMinutes } = address.zone;
  return {
    kind: "available",
    minimumDzd,
    address: address.snapshot,
    travelMinutes,
    fulfilment: { kind: "delivery", feeDzd },
  } as const;
}

type Evaluation = Extract<Awaited<ReturnType<typeof evaluateQuote>>, { kind: "priced" }>;

export function quoteBreakdown({ price, address }: Evaluation) {
  return JSON.stringify({ ...price, address });
}

async function persistQuote(sql: TransactionSql, request: QuoteRequest, evaluation: Evaluation) {
  const { price } = evaluation;
  const { customerId, input, now } = request;
  const { subtotalDzd, deliveryFeeDzd, totalDzd } = price;
  const expiresAt = new Date(now.getTime() + quoteLifetimeMs).toISOString();
  const payload = JSON.stringify(input);
  const breakdown = quoteBreakdown(evaluation);
  const [row] = await sql<{ quoteId: string }[]>`
    INSERT INTO public.quotes (customer_id, merchant_id, input, payload_hash, breakdown, created_at, expires_at)
    VALUES (${customerId}, ${input.merchantId}, ${payload}::jsonb,
      sha256(convert_to(jsonb_build_array(${payload}::jsonb, ${breakdown}::jsonb)::text, 'UTF8')),
      ${breakdown}::jsonb, ${now.toISOString()}, ${expiresAt}) RETURNING id AS "quoteId"
  `;
  if (!row) throw new Error("Quote insert returned no row");
  const quote: Quote = {
    ...row,
    expiresAt,
    fulfilment: input.fulfilment,
    subtotalDzd,
    deliveryFeeDzd,
    totalDzd,
  };
  return { kind: "quoted", quote } as const;
}

export async function lockOrderingCustomer(sql: TransactionSql, customerId: string) {
  const [customer] = await sql`
    SELECT FROM public.users WHERE id = ${customerId}
      AND deleted_at IS NULL AND blocked_at IS NULL AND phone_e164 IS NOT NULL
    FOR UPDATE
  `;
  return customer !== undefined;
}

export async function evaluateQuote(sql: TransactionSql, request: QuoteRequest) {
  const { input, now } = request;
  const merchant = await readOrderMerchant(sql, input.merchantId);
  if (!merchant) return { kind: "restaurant_unavailable" } as const;
  const service = await resolveQuoteFulfilment(sql, request, merchant);
  if (service.kind !== "available") return service;
  const slot = await resolveQuoteSlot(sql, {
    merchant,
    timing: input.timing,
    now,
    travelMinutes: service.travelMinutes,
  });
  if (slot.kind !== "available") return slot;
  const lines = await readQuoteLines(sql, input, slot.at);
  if (!lines) return { kind: "item_unavailable" } as const;
  const price = priceCashQuote({ ...service, lines });
  if (!price.ok) return { kind: price.error.code };
  return {
    kind: "priced",
    price: price.value,
    address: service.address,
    restaurantName: merchant.restaurantName,
    prepAndTravelMinutes: merchant.prepMinutes + service.travelMinutes,
  } as const;
}

async function createQuote(sql: TransactionSql, request: QuoteRequest) {
  if (!(await lockOrderingCustomer(sql, request.customerId)))
    return { kind: "unauthorized" } as const;
  const evaluated = await evaluateQuote(sql, request);
  return evaluated.kind === "priced" ? persistQuote(sql, request, evaluated) : evaluated;
}

async function pruneExpired(sql: ISql, now: Date) {
  await sql`
    DELETE FROM public.quotes WHERE id IN (
      SELECT id FROM public.quotes WHERE expires_at <= ${now.toISOString()}
      ORDER BY expires_at LIMIT 10000 FOR UPDATE SKIP LOCKED
    )
  `;
}

export function createOrderQuoteRepository({ sql }: DatabaseConnection) {
  return {
    pruneExpired: (now: Date) => pruneExpired(sql, now),
    create: (request: QuoteRequest) =>
      sql.begin("isolation level repeatable read", (tx) => createQuote(tx, request)),
  };
}
