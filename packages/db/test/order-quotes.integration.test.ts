import type { orderQuoteInput } from "@zaafran/contracts/orders";
import { randomUUID } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import type { z } from "zod";
import { createAddressRepository } from "../src/addresses.ts";
import { createOrderQuoteRepository } from "../src/order-quotes.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const repo = () => createOrderQuoteRepository(database.get());
const customerId = randomUUID();
const otherId = randomUUID();
const merchantId = randomUUID();
const communeId = randomUUID();
const categoryId = randomUUID();
const itemId = randomUUID();
const now = new Date("2026-11-11T12:00:00Z");
const pickup = {
  merchantId,
  fulfilment: "pickup",
  timing: { kind: "asap" },
  items: [{ itemId, quantity: 2, optionIds: [] }],
} satisfies z.infer<typeof orderQuoteInput>;

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO users (id, phone_e164, created_at) VALUES
    (${customerId}, '+213500000001', now()), (${otherId}, '+213500000002', now())`;
  await sql`INSERT INTO wilayas VALUES (16, 'الجزائر', 'Alger')`;
  await sql`INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'الجزائر', 'Alger', ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'))`;
  await sql`INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    VALUES (${merchantId}, 'fixture-orders', 'Table fictive', 'Propriétaire fictif', '+213500000003',
      ${communeId}, ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'), ARRAY['algerian'], 'active', now())`;
  await sql`INSERT INTO merchant_hours VALUES (${merchantId}, 3, 660, 960)`;
  await sql`INSERT INTO categories (id, merchant_id, names, sort)
    VALUES (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0)`;
  await sql`INSERT INTO items (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min)
    VALUES (${itemId}, ${merchantId}, ${categoryId}, '{"fr":"Couscous"}', '{"fr":"Légumes"}', 500, '{}', 0)`;
  await sql`INSERT INTO service_areas (slug, city, active, polygon) VALUES ('fixture-alger', 'Alger', true,
    ST_GeogFromText('SRID=4326;MULTIPOLYGON(((3 36,4 36,4 37,3 37,3 36)))'))`;
  await sql`INSERT INTO merchant_order_settings (merchant_id, pickup_enabled, delivery_enabled)
    VALUES (${merchantId}, true, true)`;
  await sql`INSERT INTO delivery_zones (merchant_id, radius_m, fee_dzd, minimum_dzd, travel_minutes)
    VALUES (${merchantId}, 1000, 137, 700, 15)`;
});

async function saveAddress(latitude: number) {
  const result = await createAddressRepository(database.get()).create(customerId, {
    label: "Maison",
    pin: { latitude, longitude: 3.0625 },
  });
  if (result.kind !== "saved") throw new Error("Expected test address");
  return result.address.addressId;
}

test("[MON-09] persists a customer-bound pickup quote and snapshot for ten minutes", async () => {
  const result = await repo().create({ customerId, input: pickup, now });
  expect(result).toMatchObject({
    kind: "quoted",
    quote: {
      expiresAt: "2026-11-11T12:10:00.000Z",
      subtotalDzd: 1000,
      deliveryFeeDzd: 0,
      totalDzd: 1000,
    },
  });
  if (result.kind !== "quoted") throw new Error("Expected quote");
  const [row] = await database.get().sql`
    SELECT customer_id, breakdown FROM quotes WHERE id = ${result.quote.quoteId}`;
  expect(row).toMatchObject({
    customer_id: customerId,
    breakdown: {
      lines: [{ itemId, names: { fr: "Couscous" }, unitPriceDzd: 500, quantity: 2 }],
    },
  });
});

test("[CUS-13] applies the active delivery zone and scopes the dropoff to the customer", async () => {
  const addressId = await saveAddress(36.751);
  const outsideId = await saveAddress(36.8);
  const input = { ...pickup, fulfilment: "delivery", addressId } as const;
  expect(await repo().create({ customerId, input, now })).toMatchObject({
    kind: "quoted",
    quote: { subtotalDzd: 1000, deliveryFeeDzd: 137, totalDzd: 1137 },
  });
  expect(await repo().create({ customerId: otherId, input, now })).toEqual({
    kind: "address_not_found",
  });
  expect(
    await repo().create({ customerId, input: { ...input, addressId: outsideId }, now }),
  ).toEqual({ kind: "outside_delivery_zone" });
});

test("[HRS-02] rejects closed ASAP and invalid slots, and prices an open quarter-hour slot", async () => {
  expect(
    await repo().create({ customerId, input: pickup, now: new Date("2026-11-11T20:00:00Z") }),
  ).toEqual({ kind: "restaurant_closed" });
  const scheduled = (scheduledFor: string) => ({
    customerId,
    now,
    input: { ...pickup, timing: { kind: "scheduled", scheduledFor } } as const,
  });
  expect(await repo().create(scheduled("2026-11-11T12:20:00Z"))).toEqual({ kind: "invalid_slot" });
  expect(await repo().create(scheduled("2026-11-11T12:30:00Z"))).toMatchObject({ kind: "quoted" });
});

test("[MON-09] cleans up expired quote snapshots and retains live ones", async () => {
  const result = await repo().create({ customerId, input: pickup, now });
  if (result.kind !== "quoted") throw new Error("Expected quote");
  const { quoteId } = result.quote;
  const { sql } = database.get();
  await repo().pruneExpired(new Date("2026-11-11T12:09:59Z"));
  expect(await sql`SELECT FROM quotes WHERE id = ${quoteId}`).toHaveLength(1);
  await repo().pruneExpired(new Date(result.quote.expiresAt));
  expect(await sql`SELECT FROM quotes WHERE id = ${quoteId}`).toHaveLength(0);
});
