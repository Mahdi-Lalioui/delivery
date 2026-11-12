import { randomUUID } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import {
  adminOrderDetailOutput,
  adminOrderSearchInput,
  adminOrderSearchOutput,
} from "@zaafran/contracts/admin-orders";
import {
  customerOrderHistoryOutput,
  customerOrderHistoryQuery,
  customerOrderReceiptOutput,
} from "@zaafran/contracts/retention";
import { orderRatingOutput, publicReviewPageOutput } from "@zaafran/contracts/ratings";
import { createOrderRepository } from "../src/orders.ts";
import { createAdminOrdersRepository } from "../src/admin-orders.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const adminId = randomUUID();
const customerId = randomUUID();
const otherId = randomUUID();
const sessionId = randomUUID();
const merchantId = randomUUID();
const otherMerchantId = randomUUID();
const demoMerchantId = randomUUID();
const activeId = randomUUID();
const secondId = randomUUID();
const terminalId = randomUUID();
const demoOrderId = randomUUID();
const phone = "+213550000001";
const repository = () => createAdminOrdersRepository(database.get());

beforeAll(async () => {
  const { sql } = database.get();
  const communeId = randomUUID();
  await sql`INSERT INTO wilayas VALUES (16, 'الجزائر', 'Alger')`;
  await sql`INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'الجزائر', 'Alger', ST_GeogFromText('SRID=4326;POINT(3.06 36.75)'))`;
  await sql`INSERT INTO users (id, phone_e164, created_at) VALUES
    (${customerId}, ${phone}, now()), (${otherId}, '+213550000002', now()),
    (${adminId}, '+213550000003', now())`;
  await sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${adminId}, decode('00', 'hex'))`;
  const merchants = [
    { id: merchantId, restaurant_name: "Cuisine 100% fictive", is_demo: false },
    { id: otherMerchantId, restaurant_name: "Cuisine 100x fictive", is_demo: false },
    { id: demoMerchantId, restaurant_name: "Restaurant démo", is_demo: true },
  ];
  await sql`
    INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location,
      cuisines, status, created_at, is_demo)
    SELECT fixture.id, 'fixture-' || fixture.id, fixture.restaurant_name, 'Équipe fictive',
      '+213550000004', commune.id, commune.centroid, ARRAY['algerian'], 'active', now(), fixture.is_demo
    FROM jsonb_to_recordset(${JSON.stringify(merchants)}::jsonb)
      AS fixture(id uuid, restaurant_name text, is_demo boolean)
    JOIN communes AS commune ON commune.id = ${communeId}
  `;
  const rows = [
    [activeId, merchantId, customerId, "AWD-2A2", "accepted", "2026-11-11T12:00:00.000124Z"],
    [secondId, otherMerchantId, otherId, "AWD-2A3", "ready", "2026-11-11T12:00:00.000123Z"],
    [terminalId, merchantId, customerId, "AWD-2A4", "collected", "2026-11-11T11:00:00Z"],
    [demoOrderId, demoMerchantId, customerId, "AWD-2A5", "accepted", "2026-11-11T13:00:00Z"],
  ] as const;
  for (const [id, restaurant, user, code, status, placedAt] of rows) {
    await sql`
      INSERT INTO orders (id, quote_id, customer_id, merchant_id, restaurant_name, short_code,
        order_day, status, fulfilment, version, placed_at, last_event_at,
        subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines)
      SELECT ${id}, ${randomUUID()}, ${user}, merchant.id, merchant.restaurant_name,
        ${code}, '2026-11-11', ${status}, 'pickup', 2, ${placedAt}, ${placedAt},
        900, 0, 900, 1000, '[]'::jsonb FROM merchants AS merchant WHERE merchant.id = ${restaurant}
    `;
  }
  await sql`
    INSERT INTO order_events (order_id, version, from_status, to_status, actor_kind, actor_id, payload, occurred_at)
    VALUES (${activeId}, 1, null, 'pending_acceptance', 'customer', ${customerId}, '{}', '2026-11-11T12:00:00Z'),
      (${activeId}, 2, 'pending_acceptance', 'accepted', 'merchant', null, '{}', '2026-11-11T12:01:00Z')
  `;
});

function search(input: unknown, accountId = adminId) {
  return repository().search({ accountId, input: adminOrderSearchInput.parse(input) });
}

test("[ADM-05] uses a precise keyset, hides demo orders and filters live, code, phone and literal restaurant names", async () => {
  const first = await search({ limit: 1 });
  if (!first?.nextCursor) throw new Error("Expected an admin cursor.");
  expect(
    adminOrderSearchOutput.parse({ ...first, sessionId }).orders.map(({ orderId }) => orderId),
  ).toEqual([activeId]);
  expect(first.nextCursor.placedAt).toBe("2026-11-11T12:00:00.000124Z");
  expect(
    (await search({ cursor: first.nextCursor, limit: 1 }))?.orders.map(({ orderId }) => orderId),
  ).toEqual([secondId]);
  for (const filter of [
    { kind: "code", code: "AWD-2A4" },
    { kind: "phone", phone },
    { kind: "restaurant", name: "100%" },
  ]) {
    const result = await search({ scope: "all", status: "collected", filter });
    expect(result?.orders.map(({ orderId }) => orderId)).toEqual([terminalId]);
  }
  expect(
    (await search({ filter: { kind: "restaurant", name: "100%" } }))?.orders.map(
      ({ orderId }) => orderId,
    ),
  ).toEqual([activeId]);
  expect(await search({}, customerId)).toBeUndefined();
});

test("[ADM-05] exposes only admin-scoped timeline events and denies a blocked administrator", async () => {
  const result = await repository().detail({ accountId: adminId, orderId: activeId });
  const detail = adminOrderDetailOutput.parse({ ...result, sessionId });
  expect(detail.events.map(({ version, actor }) => [version, actor])).toEqual([
    [1, "customer"],
    [2, "merchant"],
  ]);
  expect(detail.hasEarlierEvents).toBe(false);
  expect(await repository().detail({ accountId: adminId, orderId: demoOrderId })).toBeUndefined();
  expect(await repository().detail({ accountId: customerId, orderId: activeId })).toBeUndefined();
  const { sql } = database.get();
  await sql`UPDATE users SET blocked_at = now() WHERE id = ${adminId}`;
  expect(await search({})).toBeUndefined();
  expect(await repository().detail({ accountId: adminId, orderId: activeId })).toBeUndefined();
});

test("[CUS-21] paginates only the active customer's orders and returns a scoped receipt", async () => {
  const { sql } = database.get();
  const customerSessionId = randomUUID();
  await sql`
    INSERT INTO sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${customerSessionId}, ${customerId}, decode(repeat('01', 32), 'hex'), 'web', 'standard',
      '192.0.2.1', now(), now(), now() + interval '1 hour')
  `;
  await sql`UPDATE orders SET placed_at = '2026-11-11T12:00:00.000123Z', last_event_at = '2026-11-11T12:00:00.000123Z' WHERE id = ${terminalId}`;
  const repository = createOrderRepository(database.get());
  const scope = { customerId, sessionId: customerSessionId };
  const first = customerOrderHistoryOutput.parse(
    await repository.history({ ...scope, query: { limit: 2 } }),
  );
  expect(first.orders.map(({ orderId }) => orderId)).toEqual([demoOrderId, activeId]);
  expect(first.nextCursor).toBe(`2026-11-11T12:00:00.000124Z~${activeId}`);
  const second = customerOrderHistoryOutput.parse(
    await repository.history({
      ...scope,
      query: customerOrderHistoryQuery.parse({ cursor: first.nextCursor, limit: "2" }),
    }),
  );
  expect(second.orders.map(({ orderId }) => orderId)).toEqual([terminalId]);
  expect(second.nextCursor).toBeNull();
  const receipt = customerOrderReceiptOutput.parse(
    await repository.receipt({ ...scope, orderId: terminalId }),
  );
  expect(receipt).toMatchObject({ orderId: terminalId, totalDzd: 900, deliveryFeeDzd: 0 });
  expect(await repository.receipt({ ...scope, orderId: secondId })).toBeUndefined();
  await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${customerSessionId}`;
  expect(await repository.history({ ...scope, query: { limit: 20 } })).toBeUndefined();
  expect(await repository.receipt({ ...scope, orderId: terminalId })).toBeUndefined();
});

test("[CUS-22] scopes ratings, enforces fulfilment and deadlines, and replays the original response", async () => {
  const { sql } = database.get();
  const ratingSessionId = randomUUID();
  await sql`
    INSERT INTO sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${ratingSessionId}, ${customerId}, decode(repeat('02', 32), 'hex'), 'web', 'standard',
      '192.0.2.1', now(), now(), now() + interval '1 hour')
  `;
  const repository = createOrderRepository(database.get());
  const scope = { customerId, sessionId: ratingSessionId, orderId: terminalId };
  const now = new Date("2026-11-11T12:02:00Z");
  const command = {
    ...scope,
    now,
    idempotencyKey: "first-rating",
    input: { foodStars: 5, comment: "Très bon" },
  };
  expect(await repository.rating(scope)).toEqual({ kind: "unrated" });
  expect(await repository.rating({ ...scope, orderId: secondId })).toEqual({ kind: "not_found" });
  expect(await repository.rate({ ...command, orderId: secondId })).toEqual({ kind: "not_found" });
  expect(await repository.rate({ ...command, orderId: activeId })).toEqual({
    kind: "not_eligible",
  });
  expect(await repository.rate({ ...command, input: { foodStars: 5, deliveryStars: 4 } })).toEqual({
    kind: "invalid_stars",
  });
  const [original, replay] = await Promise.all([
    repository.rate(command),
    repository.rate(command),
  ]);
  expect(original.kind).toBe("rated");
  if (original.kind !== "rated") throw new Error("Expected the first rating");
  expect(orderRatingOutput.parse(original.rating)).toMatchObject({
    orderId: terminalId,
    foodStars: 5,
    deliveryStars: null,
    editableUntil: "2026-11-12T12:02:00.000Z",
  });
  expect(original.rating.ratingId).not.toBe(terminalId);
  expect(replay).toEqual(original);
  expect(await repository.rate({ ...command, input: { foodStars: 1 } })).toEqual({
    kind: "idempotency_conflict",
  });
  const edit = await repository.rate({
    ...command,
    idempotencyKey: "new-rating",
    input: { foodStars: 4 },
  });
  expect(edit).toEqual({
    kind: "rated",
    rating: { ...original.rating, foodStars: 4, comment: null },
  });
  expect(await repository.rate(command)).toEqual(original);
  expect(await repository.rating(scope)).toEqual(edit);
  expect(
    await repository.rate({
      ...command,
      now: new Date(original.rating.editableUntil),
      idempotencyKey: "expired-rating",
    }),
  ).toEqual({ kind: "edit_window_closed" });
  await repository.pruneRatingReceipts(new Date(original.rating.editableUntil));
  expect(
    await sql`SELECT 1 FROM public.order_rating_receipts WHERE order_id = ${terminalId}`,
  ).toEqual([]);
});

test("[CUS-23] keeps favourites private, idempotent and limited to published restaurants", async () => {
  const { sql } = database.get();
  const favouriteSessionId = randomUUID();
  await sql`
    INSERT INTO sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${favouriteSessionId}, ${customerId}, decode(repeat('03', 32), 'hex'), 'web', 'standard',
      '192.0.2.1', now(), now(), now() + interval '1 hour')
  `;
  const repository = createOrderRepository(database.get());
  const scope = { customerId, sessionId: favouriteSessionId, now: new Date() };
  expect(await repository.favourites(scope)).toEqual({ restaurants: [] });
  expect(await repository.favourites({ ...scope, customerId: otherId })).toBeUndefined();
  const add = { ...scope, merchantId, isFavourite: true };
  expect(await repository.setFavourite({ ...add, merchantId: demoMerchantId })).toBe("not_found");
  expect(await Promise.all([repository.setFavourite(add), repository.setFavourite(add)])).toEqual([
    "saved",
    "saved",
  ]);
  expect(await repository.favourites(scope)).toEqual({
    restaurants: [
      {
        merchantId,
        name: "Cuisine 100% fictive",
        slug: "fixture-" + merchantId,
        coverMediaId: null,
        isOpen: false,
      },
    ],
  });
  expect(await repository.setFavourite({ ...add, isFavourite: false })).toBe("saved");
  expect(await repository.setFavourite({ ...add, isFavourite: false })).toBe("saved");
  expect(await repository.favourites(scope)).toEqual({ restaurants: [] });
});

test("[CUS-22][MER-20] paginates anonymous reviews and scopes merchant review access", async () => {
  const { sql } = database.get();
  const reviewOwnerSession = randomUUID();
  await sql`
    INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner')
  `;
  await sql`
    INSERT INTO sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${reviewOwnerSession}, ${otherId}, decode(repeat('04', 32), 'hex'), 'web', 'standard',
      '192.0.2.1', now(), now(), now() + interval '1 hour')
  `;
  const [rating] = await sql<{ id: string }[]>`
    INSERT INTO public.ratings (order_id, food_stars, comment, created_at)
    VALUES (${terminalId}, 4, 'Repas fictif', '2026-11-11T12:03:00Z')
    ON CONFLICT (order_id) DO UPDATE SET food_stars = excluded.food_stars, comment = excluded.comment
    RETURNING id
  `;
  const repository = createOrderRepository(database.get());
  const page = await repository.publicReviews({ slug: "fixture-" + merchantId, limit: 1 });
  expect(publicReviewPageOutput.parse(page)).toMatchObject({
    reviews: [{ ratingId: rating?.id, foodStars: 4, comment: "Repas fictif", reply: null }],
    nextCursor: null,
  });
  expect(page?.reviews[0]).not.toHaveProperty("orderId");
  expect(
    await repository.publicReviews({ slug: "fixture-" + demoMerchantId, limit: 20 }),
  ).toBeUndefined();
  const scope = { accountId: otherId, sessionId: reviewOwnerSession, merchantId, limit: 20 };
  expect(await repository.merchantReviews({ ...scope, stars: 5 })).toEqual({
    reviews: [],
    nextCursor: null,
  });
  expect(await repository.merchantReviews({ ...scope, stars: 4 })).toEqual(page);
  expect(
    await repository.merchantReviews({ ...scope, merchantId: otherMerchantId }),
  ).toBeUndefined();
  expect(await repository.merchantReviews({ ...scope, accountId: customerId })).toBeUndefined();
});
