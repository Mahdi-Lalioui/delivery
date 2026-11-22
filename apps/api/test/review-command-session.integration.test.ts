import { randomUUIDv7 } from "node:crypto";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-20T12:00:00.000Z");
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(
  now.toISOString(),
);

test("[MER-20][AUTH-07] real sessions cannot reply or report on another restaurant's review", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000061", "standard"),
    seedActor("+213500000062", "standard"),
    seedActor("+213500000063", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1711"),
    seedMenuMerchants(ownerB.userId, "1712"),
  ]);
  const orderId = randomUUIDv7();
  const ratingId = randomUUIDv7();
  const { sql } = database.get();
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (${orderId}, ${randomUUIDv7()}, ${customer.userId}, ${restaurantB.owned},
      'Restaurant fictif B', 'B2C-279', ${now.toISOString()}::timestamptz::date,
      'collected', 'pickup', 4, ${now.toISOString()}, ${now.toISOString()}, 500, 0, 500, 500, '[]'::jsonb)`;
  await sql`INSERT INTO public.ratings (id, order_id, food_stars, comment, created_at)
    VALUES (${ratingId}, ${orderId}, 4, 'Avis synthétique', ${now.toISOString()})`;
  const api = await openApi();

  const snapshot = async () => ({
    replies: await sql`SELECT rating_id, body, created_at, updated_at FROM public.rating_replies
      WHERE rating_id = ${ratingId}`,
    reports: await sql`SELECT rating_id, reason, reported_at FROM public.rating_reports
      WHERE rating_id = ${ratingId}`,
    receipts: await sql`SELECT account_id, rating_id, operation, key_hash, request_hash, response
      FROM public.merchant_review_receipts WHERE rating_id = ${ratingId} ORDER BY operation`,
  });
  const unchanged = await snapshot();
  expect(unchanged).toMatchObject({ replies: [], reports: [], receipts: [] });

  for (const actor of [ownerA, customer]) {
    for (const merchantId of [restaurantA.owned, restaurantB.owned]) {
      const path = `/v1/merchants/${merchantId}/reviews/${ratingId}`;
      const reply = await api.inject({
        method: "PUT",
        url: `${path}/reply`,
        headers: { ...actor.headers, "idempotency-key": randomUUIDv7() },
        payload: { body: "Réponse étrangère" },
      });
      const report = await api.inject({
        method: "POST",
        url: `${path}/report`,
        headers: { ...actor.headers, "idempotency-key": randomUUIDv7() },
        payload: { reason: "Signalement étranger" },
      });
      for (const response of [reply, report]) {
        expect(response.statusCode).toBe(404);
        expect(response.body).not.toContain(ratingId);
        expect(response.body).not.toContain(restaurantB.owned);
      }
    }
  }
  expect(await snapshot()).toEqual(unchanged);

  const ownerBPath = `/v1/merchants/${restaurantB.owned}/reviews/${ratingId}`;
  const ownerReply = await api.inject({
    method: "PUT",
    url: `${ownerBPath}/reply`,
    headers: { ...ownerB.headers, "idempotency-key": randomUUIDv7() },
    payload: { body: "Merci pour votre retour." },
  });
  expect(ownerReply.statusCode).toBe(200);
  expect(ownerReply.json()).toMatchObject({
    ratingId,
    reply: { body: "Merci pour votre retour." },
  });

  const ownerReport = await api.inject({
    method: "POST",
    url: `${ownerBPath}/report`,
    headers: { ...ownerB.headers, "idempotency-key": randomUUIDv7() },
    payload: { reason: "Vérification du contenu" },
  });
  expect(ownerReport.statusCode).toBe(200);
  expect(ownerReport.json()).toMatchObject({ ratingId });
  expect(await snapshot()).toMatchObject({
    replies: [{ rating_id: ratingId, body: "Merci pour votre retour." }],
    reports: [{ rating_id: ratingId, reason: "Vérification du contenu" }],
    receipts: [
      { account_id: ownerB.userId, rating_id: ratingId, operation: "reply" },
      { account_id: ownerB.userId, rating_id: ratingId, operation: "report" },
    ],
  });

  await sql`UPDATE public.merchants SET status = 'active' WHERE id IN (${restaurantA.owned}, ${restaurantB.owned})`;
  const [published] = await sql<
    { slug: string }[]
  >`SELECT slug FROM public.merchants WHERE id = ${restaurantB.owned}`;
  const [otherRestaurant] = await sql<
    { slug: string }[]
  >`SELECT slug FROM public.merchants WHERE id = ${restaurantA.owned}`;
  if (!published || !otherRestaurant) throw new Error("Expected both synthetic restaurants");
  const reviews = (slug: string) => api.inject(`/v1/restaurants/${slug}/reviews`);
  const visible = await reviews(published.slug);
  expect(visible.statusCode).toBe(200);
  expect(visible.body).toContain("Avis synthétique");
  const unrelated = await reviews(otherRestaurant.slug);
  expect(unrelated.statusCode).toBe(200);
  expect(unrelated.json()).toMatchObject({ reviews: [] });

  await sql`UPDATE public.merchants SET status = 'suspended' WHERE id = ${restaurantB.owned}`;
  const hidden = await reviews(published.slug);
  expect(hidden.statusCode).toBe(404);
  expect(hidden.body).not.toContain("Avis synthétique");
});
