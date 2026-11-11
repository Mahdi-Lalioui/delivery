import type { orderQuoteInput, orderQuoteOutput } from "@zaafran/contracts/orders";
import { priceCashQuote } from "@zaafran/domain/order-quote";
import { createHash } from "node:crypto";
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
type Request = { customerId: string; input: QuoteInput; now: Date };
type PriceInput = Parameters<typeof priceCashQuote>[0];
type Price = Extract<ReturnType<typeof priceCashQuote>, { ok: true }>["value"];

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
  request: Request,
  merchant: NonNullable<Awaited<ReturnType<typeof readOrderMerchant>>>,
) {
  const { customerId, input } = request;
  if (input.fulfilment === "pickup") {
    if (!merchant.pickupEnabled) return { kind: "fulfilment_unavailable" } as const;
    return {
      kind: "available",
      minimumDzd: merchant.pickupMinimumDzd,
      travelMinutes: 0,
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
    travelMinutes,
    fulfilment: { kind: "delivery", feeDzd },
  } as const;
}

async function persistQuote(sql: TransactionSql, request: Request, price: Price) {
  const { customerId, input, now } = request;
  const { subtotalDzd, deliveryFeeDzd, totalDzd } = price;
  const expiresAt = new Date(now.getTime() + quoteLifetimeMs).toISOString();
  const payload = JSON.stringify(input);
  const breakdown = JSON.stringify(price);
  const payloadHash = createHash("sha256").update(payload).update("\0").update(breakdown).digest();
  const [row] = await sql<{ quoteId: string }[]>`
    INSERT INTO public.quotes (customer_id, merchant_id, input, payload_hash, breakdown, created_at, expires_at)
    VALUES (${customerId}, ${input.merchantId}, ${payload}::jsonb, ${payloadHash},
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

async function createQuote(sql: TransactionSql, request: Request) {
  const { customerId, input, now } = request;
  const [customer] = await sql`
    SELECT FROM public.users WHERE id = ${customerId}
      AND deleted_at IS NULL AND blocked_at IS NULL AND phone_e164 IS NOT NULL
    FOR UPDATE
  `;
  if (!customer) return { kind: "unauthorized" } as const;
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
  return persistQuote(sql, request, price.value);
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
    create: (request: Request) =>
      sql.begin("isolation level repeatable read", (tx) => createQuote(tx, request)),
  };
}
