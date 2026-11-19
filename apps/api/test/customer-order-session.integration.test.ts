import { randomUUID } from "node:crypto";
import { orderRatingOutput } from "@zaafran/contracts/ratings";
import { customerReorderOutput } from "@zaafran/contracts/retention";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);

async function seedRestaurant() {
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
    ) VALUES (${merchantId}, 'order-isolation', 'Synthetic restaurant', 'Synthetic owner',
      '+213500000003', ${communeId}, ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'),
      ARRAY['algerian'], 'active', ${now})`;
  await sql`INSERT INTO public.categories (id, merchant_id, names, sort)
    VALUES (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0)`;
  await sql`INSERT INTO public.items (
      id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min, moderation_status
    ) VALUES (${itemId}, ${merchantId}, ${categoryId}, '{"fr":"Couscous"}', '{"fr":"Légumes"}',
      500, '{}', 0, 'approved')`;
  return { merchantId, itemId };
}

async function seedRatedOrder(input: {
  customerId: string;
  merchantId: string;
  itemId: string;
  shortCode: string;
  quantity: number;
  comment: string;
}) {
  const { sql } = database.get();
  const orderId = randomUUID();
  const ratingId = randomUUID();
  const lines = [
    {
      itemId: input.itemId,
      names: { fr: "Couscous" },
      unitPriceDzd: 500,
      quantity: input.quantity,
      options: [],
      note: "",
      lineTotalDzd: 500 * input.quantity,
    },
  ];
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (${orderId}, ${randomUUID()}, ${input.customerId}, ${input.merchantId},
      'Synthetic restaurant', ${input.shortCode}, current_date, 'collected', 'pickup', 4,
      ${now}, ${now}, ${500 * input.quantity}, 0, ${500 * input.quantity}, ${500 * input.quantity},
      ${JSON.stringify(lines)}::jsonb)`;
  await sql`INSERT INTO public.ratings (id, order_id, food_stars, comment, created_at)
    VALUES (${ratingId}, ${orderId}, 4, ${input.comment}, ${now})`;
  return { orderId, ratingId, quantity: input.quantity, comment: input.comment };
}

test("[CUS-21][CUS-22][AUTH-07] real customer sessions conceal foreign order ratings and reorder drafts", async () => {
  const [first, second] = await Promise.all([
    seedActor("+213500000001", "standard"),
    seedActor("+213500000002", "standard"),
  ]);
  const catalog = await seedRestaurant();
  const [firstOrder, secondOrder] = await Promise.all([
    seedRatedOrder({
      ...catalog,
      customerId: first.userId,
      shortCode: "AAA-222",
      quantity: 2,
      comment: "Premier avis privé",
    }),
    seedRatedOrder({
      ...catalog,
      customerId: second.userId,
      shortCode: "BBB-333",
      quantity: 3,
      comment: "Deuxième avis privé",
    }),
  ]);
  const api = await openApi();
  const orderIds = [firstOrder.orderId, secondOrder.orderId];
  const { sql } = database.get();
  const beforeOrders = await sql`
    SELECT to_jsonb(purchase) AS data FROM public.orders AS purchase
    WHERE id = ANY(${orderIds}::uuid[]) ORDER BY id
  `;
  const beforeRatings = await sql`
    SELECT to_jsonb(rating) AS data FROM public.ratings AS rating
    WHERE order_id = ANY(${orderIds}::uuid[]) ORDER BY order_id
  `;
  expect(beforeOrders).toHaveLength(2);
  expect(beforeRatings).toHaveLength(2);

  for (const [actor, foreignOrder] of [
    [first, secondOrder],
    [second, firstOrder],
  ] as const) {
    const path = `/v1/orders/${foreignOrder.orderId}/rating`;
    const read = await api.inject({ url: path, headers: actor.headers });
    const write = await api.inject({
      method: "PUT",
      url: path,
      headers: { ...actor.headers, "idempotency-key": "foreign-rating" },
      payload: { foodStars: 1, comment: "Foreign overwrite" },
    });
    const reorder = await api.inject({
      method: "POST",
      url: `/v1/me/orders/${foreignOrder.orderId}/reorder`,
      headers: actor.headers,
    });
    for (const response of [read, write, reorder]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
      expect(response.body).not.toContain(foreignOrder.orderId);
      expect(response.body).not.toContain(foreignOrder.ratingId);
      expect(response.body).not.toContain(foreignOrder.comment);
    }
  }
  expect(
    await sql`
    SELECT to_jsonb(purchase) AS data FROM public.orders AS purchase
    WHERE id = ANY(${orderIds}::uuid[]) ORDER BY id
  `,
  ).toEqual(beforeOrders);
  expect(
    await sql`
    SELECT to_jsonb(rating) AS data FROM public.ratings AS rating
    WHERE order_id = ANY(${orderIds}::uuid[]) ORDER BY order_id
  `,
  ).toEqual(beforeRatings);
  expect(await sql`SELECT FROM public.order_rating_receipts`).toHaveLength(0);
  expect(await sql`SELECT FROM public.order_events`).toHaveLength(0);
  expect(await sql`SELECT FROM public.quotes`).toHaveLength(0);

  for (const [actor, order] of [
    [first, firstOrder],
    [second, secondOrder],
  ] as const) {
    const path = `/v1/orders/${order.orderId}/rating`;
    const read = await api.inject({ url: path, headers: actor.headers });
    expect(read.statusCode).toBe(200);
    expect(orderRatingOutput.parse(read.json())).toMatchObject({
      orderId: order.orderId,
      ratingId: order.ratingId,
      foodStars: 4,
      comment: order.comment,
    });
    const written = await api.inject({
      method: "PUT",
      url: path,
      headers: { ...actor.headers, "idempotency-key": "owned-rating" },
      payload: { foodStars: 5, comment: "Avis du propriétaire de la commande" },
    });
    expect(written.statusCode).toBe(200);
    expect(orderRatingOutput.parse(written.json())).toMatchObject({
      orderId: order.orderId,
      ratingId: order.ratingId,
      foodStars: 5,
      comment: "Avis du propriétaire de la commande",
    });
    expect(
      await sql`SELECT customer_id FROM public.order_rating_receipts WHERE order_id = ${order.orderId}`,
    ).toEqual([{ customer_id: actor.userId }]);
    const reordered = await api.inject({
      method: "POST",
      url: `/v1/me/orders/${order.orderId}/reorder`,
      headers: actor.headers,
    });
    expect(reordered.statusCode).toBe(200);
    expect(customerReorderOutput.parse(reordered.json())).toMatchObject({
      draft: {
        merchantId: catalog.merchantId,
        items: [{ itemId: catalog.itemId, quantity: order.quantity, optionIds: [] }],
      },
      unavailable: [],
      priceChanges: [],
    });
  }
  expect(
    await sql`
    SELECT to_jsonb(purchase) AS data FROM public.orders AS purchase
    WHERE id = ANY(${orderIds}::uuid[]) ORDER BY id
  `,
  ).toEqual(beforeOrders);
});
