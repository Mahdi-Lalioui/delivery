import { randomUUID } from "node:crypto";
import { addressOutput } from "@zaafran/contracts/addresses";
import { customerPrivacyExportOutput } from "@zaafran/contracts/retention";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);
type Api = Awaited<ReturnType<typeof openApi>>;
type Actor = Awaited<ReturnType<typeof seedActor>>;

async function seedPrivateData(
  api: Api,
  merchantId: string,
  customer: {
    actor: Actor;
    phone: string;
    contactPhone: string;
    marker: string;
    shortCode: string;
  },
) {
  const saved = await api.inject({
    method: "POST",
    url: "/v1/me/addresses",
    headers: customer.actor.headers,
    payload: {
      label: `${customer.marker} address`,
      landmark: `${customer.marker} landmark`,
      instructions: `${customer.marker} instructions`,
      pin: { latitude: 36.75, longitude: 3.0625 },
    },
  });
  expect(saved.statusCode).toBe(201);
  const address = addressOutput.parse(saved.json());
  const orderId = randomUUID();
  const ratingId = randomUUID();
  const itemId = randomUUID();
  const lines = [
    {
      itemId,
      names: { fr: `${customer.marker} dish` },
      unitPriceDzd: 500,
      quantity: 1,
      options: [],
      note: "",
    },
  ];
  const { sql } = database.get();
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines, contact_phone_e164
    ) VALUES (${orderId}, ${randomUUID()}, ${customer.actor.userId}, ${merchantId},
      'Synthetic export restaurant', ${customer.shortCode}, current_date, 'collected', 'pickup',
      4, ${now}, ${now}, 500, 0, 500, 500, ${JSON.stringify(lines)}::jsonb, ${customer.contactPhone})`;
  await sql`INSERT INTO public.ratings (id, order_id, food_stars, comment, created_at)
    VALUES (${ratingId}, ${orderId}, 5, ${customer.marker + " rating"}, ${now})`;
  return { ...customer, address, orderId, ratingId, itemId };
}

test("[CUS-24][AUTH-07] real customer exports contain only the caller's profile, addresses, orders and ratings", async () => {
  const firstPhone = "+213500000001";
  const secondPhone = "+213500000002";
  const [first, second] = await Promise.all([
    seedActor(firstPhone, "standard"),
    seedActor(secondPhone, "standard"),
  ]);
  const { sql } = database.get();
  const communeId = randomUUID();
  const merchantId = randomUUID();
  await sql`INSERT INTO public.wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  await sql`INSERT INTO public.communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'))`;
  await sql`INSERT INTO public.merchants (
      id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at
    ) VALUES (${merchantId}, 'export-isolation', 'Synthetic export restaurant', 'Synthetic owner',
      '+213500000003', ${communeId}, ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'),
      ARRAY['algerian'], 'active', ${now})`;
  await sql`INSERT INTO public.service_areas (slug, city, active, polygon)
    VALUES ('export-isolation', 'Alger', true,
      ST_GeogFromText('SRID=4326;MULTIPOLYGON(((3 36,4 36,4 37,3 37,3 36)))'))`;
  const api = await openApi();
  const [firstData, secondData] = await Promise.all([
    seedPrivateData(api, merchantId, {
      actor: first,
      phone: firstPhone,
      contactPhone: "+213500000011",
      marker: "PRIVATE-ALPHA",
      shortCode: "AAA-222",
    }),
    seedPrivateData(api, merchantId, {
      actor: second,
      phone: secondPhone,
      contactPhone: "+213500000012",
      marker: "PRIVATE-BRAVO",
      shortCode: "BBB-333",
    }),
  ]);

  for (const [own, foreign] of [
    [firstData, secondData],
    [secondData, firstData],
  ] as const) {
    const response = await api.inject({ url: "/v1/me/export", headers: own.actor.headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const exported = customerPrivacyExportOutput.parse(response.json());
    expect(exported.profile).toEqual({ accountId: own.actor.userId, phoneE164: own.phone });
    expect(exported.addresses).toHaveLength(1);
    expect(exported.addresses[0]).toMatchObject({
      addressId: own.address.addressId,
      label: `${own.marker} address`,
      landmark: `${own.marker} landmark`,
      instructions: `${own.marker} instructions`,
    });
    expect(exported.orders).toHaveLength(1);
    expect(exported.orders[0]).toMatchObject({
      orderId: own.orderId,
      shortCode: own.shortCode,
      lines: [{ itemId: own.itemId, names: { fr: `${own.marker} dish` } }],
    });
    expect(exported.orderContacts).toEqual([{ orderId: own.orderId, phoneE164: own.contactPhone }]);
    expect(exported.ratings).toHaveLength(1);
    expect(exported.ratings[0]).toMatchObject({
      orderId: own.orderId,
      ratingId: own.ratingId,
      comment: `${own.marker} rating`,
      foodStars: 5,
    });
    for (const privateValue of [
      foreign.actor.userId,
      foreign.actor.sessionId,
      foreign.address.addressId,
      foreign.orderId,
      foreign.ratingId,
      foreign.itemId,
      foreign.phone,
      foreign.contactPhone,
      foreign.shortCode,
      foreign.marker,
    ]) {
      expect(response.body).not.toContain(privateValue);
    }
  }
});
