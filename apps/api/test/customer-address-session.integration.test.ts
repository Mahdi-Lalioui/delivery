import { randomUUID } from "node:crypto";
import { addressListOutput, addressOutput } from "@zaafran/contracts/addresses";
import { orderQuoteOutput, orderSummary } from "@zaafran/contracts/orders";
import { runMigrations } from "graphile-worker";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);

async function seedDeliveryRestaurant() {
  const { sql } = database.get();
  const merchantId = randomUUID();
  const communeId = randomUUID();
  const categoryId = randomUUID();
  const itemId = randomUUID();
  await sql`INSERT INTO public.wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  await sql`INSERT INTO public.communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'))`;
  await sql`INSERT INTO public.merchants (
      id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at
    ) VALUES (${merchantId}, 'address-isolation', 'Synthetic restaurant', 'Synthetic owner',
      '+213500000003', ${communeId}, ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'),
      ARRAY['algerian'], 'active', ${now})`;
  await sql`INSERT INTO public.categories (id, merchant_id, names, sort)
    VALUES (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0)`;
  await sql`INSERT INTO public.items (
      id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min
    ) VALUES (${itemId}, ${merchantId}, ${categoryId}, '{"fr":"Couscous"}', '{"fr":"Légumes"}', 1000, '{}', 0)`;
  await sql`INSERT INTO public.merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
    SELECT ${merchantId}, weekday, 0, 1440 FROM generate_series(0, 6) AS weekday`;
  await sql`INSERT INTO public.merchant_order_settings (merchant_id, pickup_enabled, delivery_enabled)
    VALUES (${merchantId}, true, true)`;
  await sql`INSERT INTO public.delivery_zones (merchant_id, radius_m, fee_dzd, minimum_dzd, travel_minutes)
    VALUES (${merchantId}, 1000, 100, 500, 15)`;
  await sql`INSERT INTO public.service_areas (slug, city, active, polygon)
    VALUES ('address-isolation', 'Alger', true,
      ST_GeogFromText('SRID=4326;MULTIPOLYGON(((3 36,4 36,4 37,3 37,3 36)))'))`;
  return { merchantId, itemId };
}

test("[CUS-11][CUS-13][AUTH-07] real customer sessions cannot change or use another customer's saved address", async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const [first, second] = await Promise.all([
    seedActor("+213500000001", "standard"),
    seedActor("+213500000002", "standard"),
  ]);
  const catalog = await seedDeliveryRestaurant();
  const api = await openApi();
  const firstSaved = await api.inject({
    method: "POST",
    url: "/v1/me/addresses",
    headers: first.headers,
    payload: { label: "Première adresse", pin: { latitude: 36.751, longitude: 3.0625 } },
  });
  const secondSaved = await api.inject({
    method: "POST",
    url: "/v1/me/addresses",
    headers: second.headers,
    payload: { label: "Deuxième adresse", pin: { latitude: 36.752, longitude: 3.0625 } },
  });
  expect(firstSaved.statusCode).toBe(201);
  expect(secondSaved.statusCode).toBe(201);
  const firstAddress = addressOutput.parse(firstSaved.json());
  const secondAddress = addressOutput.parse(secondSaved.json());
  const delivery = {
    merchantId: catalog.merchantId,
    fulfilment: "delivery",
    timing: { kind: "asap" },
    items: [{ itemId: catalog.itemId, quantity: 1, optionIds: [] }],
  };
  const firstQuoted = await api.inject({
    method: "POST",
    url: "/v1/quotes",
    headers: first.headers,
    payload: { ...delivery, addressId: firstAddress.addressId },
  });
  const secondQuoted = await api.inject({
    method: "POST",
    url: "/v1/quotes",
    headers: second.headers,
    payload: { ...delivery, addressId: secondAddress.addressId },
  });
  expect(firstQuoted.statusCode).toBe(201);
  expect(secondQuoted.statusCode).toBe(201);
  const firstQuote = orderQuoteOutput.parse(firstQuoted.json());
  const secondQuote = orderQuoteOutput.parse(secondQuoted.json());
  const customerIds = [first.userId, second.userId];
  const { sql } = database.get();
  const beforeAddresses = await sql`
    SELECT to_jsonb(address) AS data FROM public.addresses AS address
    WHERE user_id = ANY(${customerIds}::uuid[]) ORDER BY id
  `;
  const beforeQuotes = await sql`
    SELECT to_jsonb(quote) AS data FROM public.quotes AS quote
    WHERE customer_id = ANY(${customerIds}::uuid[]) ORDER BY id
  `;
  expect(beforeAddresses).toHaveLength(2);
  expect(beforeQuotes).toHaveLength(2);

  for (const [actor, ownAddress, foreignAddress, foreignQuote] of [
    [first, firstAddress, secondAddress, secondQuote],
    [second, secondAddress, firstAddress, firstQuote],
  ] as const) {
    const listed = await api.inject({ url: "/v1/me/addresses", headers: actor.headers });
    expect(listed.statusCode).toBe(200);
    expect(addressListOutput.parse(listed.json()).addresses).toEqual([ownAddress]);
    const addressUrl = `/v1/me/addresses/${foreignAddress.addressId}`;
    for (const method of ["PUT", "DELETE"] as const) {
      const denied = await api.inject({
        method,
        url: addressUrl,
        headers: actor.headers,
        ...(method === "PUT"
          ? {
              payload: { label: "Changed address", pin: ownAddress.pin, isDefault: true },
            }
          : {}),
      });
      expect(denied.statusCode, `${method} foreign address`).toBe(404);
      expect(denied.json()).toMatchObject({ code: "not_found" });
    }
    const deniedQuote = await api.inject({
      method: "POST",
      url: "/v1/quotes",
      headers: actor.headers,
      payload: { ...delivery, addressId: foreignAddress.addressId },
    });
    expect(deniedQuote.statusCode).toBe(404);
    expect(deniedQuote.json()).toMatchObject({ code: "not_found" });
    expect(deniedQuote.body).not.toContain(foreignAddress.addressId);
    const deniedPlacement = await api.inject({
      method: "POST",
      url: "/v1/orders",
      headers: { ...actor.headers, "idempotency-key": "foreign-address-quote" },
      payload: { quoteId: foreignQuote.quoteId },
    });
    expect(deniedPlacement.statusCode).toBe(409);
    expect(deniedPlacement.json()).toMatchObject({ code: "quote_expired" });
  }
  expect(
    await sql`
    SELECT to_jsonb(address) AS data FROM public.addresses AS address
    WHERE user_id = ANY(${customerIds}::uuid[]) ORDER BY id
  `,
  ).toEqual(beforeAddresses);
  expect(
    await sql`
    SELECT to_jsonb(quote) AS data FROM public.quotes AS quote
    WHERE customer_id = ANY(${customerIds}::uuid[]) ORDER BY id
  `,
  ).toEqual(beforeQuotes);
  expect(
    await sql`SELECT FROM public.orders WHERE customer_id = ANY(${customerIds}::uuid[])`,
  ).toHaveLength(0);
  expect(
    await sql`SELECT FROM public.order_placement_receipts WHERE customer_id = ANY(${customerIds}::uuid[])`,
  ).toHaveLength(0);
  expect(await sql`SELECT FROM public.order_events`).toHaveLength(0);

  for (const [actor, address, quote] of [
    [first, firstAddress, firstQuote],
    [second, secondAddress, secondQuote],
  ] as const) {
    const placed = await api.inject({
      method: "POST",
      url: "/v1/orders",
      headers: { ...actor.headers, "idempotency-key": "owned-address-quote" },
      payload: { quoteId: quote.quoteId },
    });
    expect(placed.statusCode).toBe(201);
    const order = orderSummary.parse(placed.json());
    expect(
      await sql`SELECT customer_id, address_snapshot->>'addressId' AS address_id
      FROM public.orders WHERE id = ${order.orderId}`,
    ).toEqual([{ customer_id: actor.userId, address_id: address.addressId }]);
  }
});
