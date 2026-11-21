import { randomUUID } from "node:crypto";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderRatingOutput } from "@zaafran/contracts/ratings";
import { customerOrderHistoryOutput, customerReorderOutput } from "@zaafran/contracts/retention";
import { runMigrations } from "graphile-worker";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);
let restaurantSequence = 0;

async function seedRestaurant() {
  const { sql } = database.get();
  restaurantSequence += 1;
  const merchantId = randomUUID();
  const communeId = randomUUID();
  const categoryId = randomUUID();
  const itemId = randomUUID();
  const code = String(1698 + restaurantSequence).padStart(4, "0");
  const slug = `order-isolation-${String(restaurantSequence)}`;
  const phone = `+2135${String(restaurantSequence).padStart(8, "0")}`;
  await sql`INSERT INTO public.wilayas (code, name_ar, name_fr)
    VALUES (16, 'الجزائر', 'Alger') ON CONFLICT (code) DO NOTHING`;
  await sql`INSERT INTO public.communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, ${code}, 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'))`;
  await sql`INSERT INTO public.merchants (
      id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at
    ) VALUES (${merchantId}, ${slug}, 'Synthetic restaurant', 'Synthetic owner',
      ${phone}, ${communeId}, ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'),
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

async function seedHistoryOrder(input: {
  customerId: string;
  merchantId: string;
  placedAt: string;
  shortCode: string;
}) {
  const { sql } = database.get();
  const orderId = randomUUID();
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (${orderId}, ${randomUUID()}, ${input.customerId}, ${input.merchantId},
      'Synthetic restaurant', ${input.shortCode}, ${input.placedAt}::timestamptz::date,
      'collected', 'pickup', 4, ${input.placedAt}, ${input.placedAt}, 500, 0, 500, 500, '[]'::jsonb)`;
  return orderId;
}

test("[ORD-02][AUTH-07] order rejection cannot mark another restaurant's item sold out", async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const [owner, customer] = await Promise.all([
    seedActor("+213500000016", "standard"),
    seedActor("+213500000017", "standard"),
  ]);
  const own = await seedRestaurant();
  const foreign = await seedRestaurant();
  const { sql } = database.get();
  await sql`INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${own.merchantId}, ${owner.userId}, 'owner')`;
  const orderId = randomUUID();
  const lines = [
    {
      itemId: own.itemId,
      names: { fr: "Couscous" },
      unitPriceDzd: 500,
      quantity: 1,
      options: [],
      note: "",
      lineTotalDzd: 500,
    },
  ];
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at, acceptance_deadline_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (${orderId}, ${randomUUID()}, ${customer.userId}, ${own.merchantId},
      'Synthetic restaurant', 'BBB-234', current_date, 'pending_acceptance', 'pickup', 1,
      ${now}, ${now}, ${now}::timestamptz + interval '5 minutes', 500, 0, 500, 500,
      ${JSON.stringify(lines)}::jsonb)`;
  const api = await openApi();
  const reject = (soldOutItemIds: string[]) =>
    api.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/reject`,
      headers: { ...owner.headers, "idempotency-key": randomUUID() },
      payload: { expectedVersion: 1, reason: "item_unavailable", soldOutItemIds },
    });
  const itemStates = () => sql`SELECT id, is_available FROM public.items
    WHERE id IN (${own.itemId}, ${foreign.itemId}) ORDER BY id`;
  const before = await itemStates();
  expect(before).toHaveLength(2);
  const denied = await reject([own.itemId, foreign.itemId]);
  expect(denied.statusCode).toBe(400);
  expect(problemResponseSchema.parse(denied.json()).code).toBe("invalid_order_command");
  expect(denied.body).not.toContain(foreign.itemId);
  expect(await itemStates()).toEqual(before);
  expect(await sql`SELECT status, version FROM public.orders WHERE id = ${orderId}`).toEqual([
    { status: "pending_acceptance", version: 1 },
  ]);
  expect(await sql`SELECT FROM public.order_events WHERE order_id = ${orderId}`).toEqual([]);
  expect(await sql`SELECT FROM public.order_action_receipts WHERE order_id = ${orderId}`).toEqual(
    [],
  );

  const allowed = await reject([own.itemId]);
  expect(allowed.statusCode).toBe(200);
  expect(allowed.json()).toMatchObject({ status: "rejected", version: 2 });
  expect(await itemStates()).toEqual(
    [own.itemId, foreign.itemId].sort().map((id) => ({ id, is_available: id === foreign.itemId })),
  );
});

test("[AUTH-07] customer order-history pages remain isolated with interleaved orders and foreign cursors", async () => {
  const [first, second] = await Promise.all([
    seedActor("+213500000011", "standard"),
    seedActor("+213500000012", "standard"),
  ]);
  const { merchantId } = await seedRestaurant();
  const base = Date.now();
  const timeline = [
    { owner: second, shortCode: "B2C-234", offset: 6 },
    { owner: first, shortCode: "A2C-234", offset: 5 },
    { owner: second, shortCode: "B3D-234", offset: 4 },
    { owner: first, shortCode: "A3D-234", offset: 3 },
    { owner: second, shortCode: "B4E-234", offset: 2 },
    { owner: first, shortCode: "A4E-234", offset: 1 },
  ];
  const seeded = await Promise.all(
    timeline.map(async (entry) => ({
      ...entry,
      orderId: await seedHistoryOrder({
        customerId: entry.owner.userId,
        merchantId,
        placedAt: new Date(base - entry.offset * 60_000).toISOString(),
        shortCode: entry.shortCode,
      }),
    })),
  );
  const api = await openApi();

  async function readPage(headers: Record<string, string>, cursor?: string) {
    const query = new URLSearchParams({ limit: "1" });
    if (cursor) query.set("cursor", cursor);
    const response = await api.inject({ url: `/v1/me/orders?${query}`, headers });
    expect(response.statusCode).toBe(200);
    const page = customerOrderHistoryOutput.parse(response.json());
    expect(page.orders.length).toBeLessThanOrEqual(1);
    return page;
  }

  async function readAll(actor: typeof first, cursor?: string) {
    const orderIds: string[] = [];
    let nextCursor = cursor;
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const page = await readPage(actor.headers, nextCursor);
      orderIds.push(...page.orders.map((order) => order.orderId));
      nextCursor = page.nextCursor ?? undefined;
      if (!nextCursor) return orderIds;
    }
    throw new Error("Customer order history did not finish within the page bound.");
  }

  const { sql } = database.get();
  const databaseOrder = await sql<{ orderId: string; customerId: string }[]>`
    SELECT id AS "orderId", customer_id AS "customerId" FROM public.orders
    WHERE id = ANY(${seeded.map((order) => order.orderId)}::uuid[])
    ORDER BY placed_at DESC, id DESC
  `;
  expect(databaseOrder.map((order) => order.customerId)).toEqual([
    first.userId,
    second.userId,
    first.userId,
    second.userId,
    first.userId,
    second.userId,
  ]);
  const firstExpected = databaseOrder
    .filter((order) => order.customerId === first.userId)
    .map((order) => order.orderId);
  const secondExpected = databaseOrder
    .filter((order) => order.customerId === second.userId)
    .map((order) => order.orderId);
  expect(await readAll(first)).toEqual(firstExpected);
  const secondFirstPage = await readPage(second.headers);
  expect(secondFirstPage.orders.map((order) => order.orderId)).toEqual([secondExpected[0]]);
  expect(secondFirstPage.nextCursor).not.toBeNull();
  expect(await readAll(second)).toEqual(secondExpected);

  const firstAfterForeignCursor = await readAll(first, secondFirstPage.nextCursor ?? undefined);
  const foreignPosition = secondFirstPage.orders[0];
  if (!foreignPosition)
    throw new Error("The foreign account's first page should contain an order.");
  const afterPositionExpected = await sql<{ orderId: string }[]>`
    SELECT id AS "orderId" FROM public.orders
    WHERE customer_id = ${first.userId}
      AND (placed_at, id) < (${foreignPosition.placedAt}::timestamptz, ${foreignPosition.orderId}::uuid)
    ORDER BY placed_at DESC, id DESC
  `;
  expect(firstAfterForeignCursor).toEqual(afterPositionExpected.map((order) => order.orderId));
  expect(firstAfterForeignCursor.length).toBeGreaterThan(0);
  expect(firstAfterForeignCursor).not.toContain(secondExpected[0]);
  for (const order of [...firstExpected, ...secondExpected]) {
    const owner = firstExpected.includes(order) ? first : second;
    const foreign = owner.userId === first.userId ? second : first;
    const foreignPage = await readPage(foreign.headers);
    expect(foreignPage.orders.map((item) => item.orderId)).not.toContain(order);
  }
});

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
  const readEvents = () => sql`SELECT to_jsonb(event) AS data FROM public.order_events AS event
    ORDER BY order_id, version`;
  const beforeEvents = await readEvents();
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
  expect(await readEvents()).toEqual(beforeEvents);
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
