import type { orderQuoteInput } from "@zaafran/contracts/orders";
import { randomBytes, randomUUID } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { beforeAll, expect, test } from "vitest";
import type { z } from "zod";
import { createAddressRepository } from "../src/addresses.ts";
import { createAuthRepository } from "../src/auth.ts";
import { pruneCourierPositions } from "../src/courier-retention.ts";
import { createCourierRepository } from "../src/couriers.ts";
import { createMediaRepository } from "../src/media.ts";
import { deriveDeliveryCode } from "../src/order-delivery-code.ts";
import { createOrderQuoteRepository } from "../src/order-quotes.ts";
import { createOrderRepository } from "../src/orders.ts";
import { createPrivacyRepository } from "../src/privacy.ts";
import { seedReadyPhoto } from "./ready-photo.ts";
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
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
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

const orders = () => createOrderRepository(database.get(), Buffer.alloc(32, 7));

async function placement(input: z.infer<typeof orderQuoteInput> = pickup) {
  const result = await repo().create({ customerId, input, now });
  if (result.kind !== "quoted") throw new Error("Expected quote");
  return {
    customerId,
    now,
    input: { quoteId: result.quote.quoteId },
    idempotencyKey: randomUUID(),
  };
}

test("[ORD-05][ORD-07] concurrent retry returns one order, one event and one job", async () => {
  const request = await placement();
  const [first, second] = await Promise.all([orders().place(request), orders().place(request)]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    kind: "placed",
    order: {
      status: "pending_acceptance",
      fulfilment: "pickup",
      totalDzd: 1000,
      version: 1,
      acceptanceDeadlineAt: "2026-11-11T12:08:00.000Z",
    },
  });
  if (first.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = first.order;
  const { sql } = database.get();
  expect(await sql`SELECT FROM order_events WHERE order_id = ${orderId}`).toHaveLength(1);
  expect(
    await sql`SELECT FROM graphile_worker.jobs WHERE key = ${"order:expire:" + orderId}`,
  ).toHaveLength(1);
  expect(await orders().place({ ...request, now: new Date("2026-11-11T12:11:00Z") })).toEqual(
    first,
  );
  expect(
    await orders().place({ ...request, input: { ...request.input, payingWithDzd: 2000 } }),
  ).toEqual({ kind: "idempotency_conflict" });
  expect(await orders().place({ ...request, idempotencyKey: randomUUID() })).toEqual({
    kind: "quote_consumed",
  });
});

test("[MON-09] placement rechecks expiry, customer ownership and changed menu prices", async () => {
  const request = await placement();
  expect(await orders().place({ ...request, customerId: otherId })).toEqual({
    kind: "quote_expired",
  });
  expect(await orders().place({ ...request, now: new Date("2026-11-11T12:10:00Z") })).toEqual({
    kind: "quote_expired",
  });
  const { sql } = database.get();
  await sql`UPDATE items SET price_dzd = 600 WHERE id = ${itemId}`;
  try {
    expect(await orders().place(request)).toEqual({ kind: "quote_changed" });
  } finally {
    await sql`UPDATE items SET price_dzd = 500 WHERE id = ${itemId}`;
  }
});

test("[MON-07][MON-08] enforces cash tender and the first-order cap", async () => {
  const request = await placement();
  expect(
    await orders().place({ ...request, input: { ...request.input, payingWithDzd: 999 } }),
  ).toEqual({ kind: "invalid_change" });
  const expensive = await placement({
    ...pickup,
    items: [{ itemId, quantity: 13, optionIds: [] }],
  });
  expect(await orders().place(expensive)).toEqual({ kind: "cash_limit" });
});

test("[ORD-07] a failed enqueue rolls back the order and the command receipt", async () => {
  const request = await placement();
  const { sql } = database.get();
  await sql`ALTER SCHEMA graphile_worker RENAME TO unavailable_worker`;
  try {
    await expect(orders().place(request)).rejects.toThrow();
    expect(await sql`SELECT FROM orders WHERE quote_id = ${request.input.quoteId}`).toHaveLength(0);
  } finally {
    await sql`ALTER SCHEMA unavailable_worker RENAME TO graphile_worker`;
  }
  expect(await orders().place(request)).toMatchObject({ kind: "placed" });
});

test("[ORD-07] timeout is a no-op before its deadline and appends one event on retry", async () => {
  const request = await placement();
  const placed = await orders().place(request);
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  await orders().runTimer(orderId, "expire", now);
  const { sql } = database.get();
  expect(await sql`SELECT status FROM orders WHERE id = ${orderId}`).toEqual([
    { status: "pending_acceptance" },
  ]);
  const deadline = new Date("2026-11-11T12:08:00Z");
  await Promise.all([
    orders().runTimer(orderId, "expire", deadline),
    orders().runTimer(orderId, "expire", deadline),
  ]);
  expect(await sql`SELECT status, version FROM orders WHERE id = ${orderId}`).toEqual([
    { status: "expired", version: 2 },
  ]);
  expect(await sql`SELECT FROM order_events WHERE order_id = ${orderId}`).toHaveLength(2);
  expect(
    await sql`
    SELECT task_identifier FROM graphile_worker.jobs
    WHERE key = ${"order:sms:" + orderId + ":2"}
  `,
  ).toEqual([{ task_identifier: "order.sms" }]);
});

test("[ORD-07] scheduled release starts a fresh acceptance timer", async () => {
  const request = await placement({
    ...pickup,
    timing: { kind: "scheduled", scheduledFor: "2026-11-11T13:00:00Z" },
  });
  const placed = await orders().place(request);
  if (placed.kind !== "placed") throw new Error("Expected placement");
  expect(placed.order.status).toBe("scheduled");
  const { orderId } = placed.order;
  await orders().runTimer(orderId, "release", new Date("2026-11-11T12:30:00Z"));
  const { sql } = database.get();
  expect(await sql`SELECT status, version FROM orders WHERE id = ${orderId}`).toEqual([
    { status: "pending_acceptance", version: 2 },
  ]);
  expect(
    await sql`SELECT FROM graphile_worker.jobs WHERE key = ${"order:expire:" + orderId}`,
  ).toHaveLength(1);
});

test("[MON-09] moving a saved pin invalidates its quote even when the zone fee stays the same", async () => {
  const addressId = await saveAddress(36.751);
  const request = await placement({ ...pickup, fulfilment: "delivery", addressId });
  await createAddressRepository(database.get()).update(customerId, addressId, {
    label: "Maison",
    pin: { latitude: 36.752, longitude: 3.0625 },
  });
  expect(await orders().place(request)).toEqual({ kind: "quote_changed" });
});

test("[CUS-24] anonymised orders still expire and retain their accounting totals", async () => {
  const request = await placement();
  const placed = await orders().place(request);
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const { sql } = database.get();
  await sql`UPDATE orders SET customer_id = NULL WHERE id = ${orderId}`;
  await orders().runTimer(orderId, "expire", new Date("2026-11-11T12:08:00Z"));
  expect(await sql`SELECT status, total_dzd FROM orders WHERE id = ${orderId}`).toEqual([
    { status: "expired", total_dzd: 1000 },
  ]);
});

test("[ORD-03][ORD-04] only one concurrent merchant accept wins and replays return the original result", async () => {
  const request = await placement();
  const placed = await orders().place(request);
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const { sql } = database.get();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner') ON CONFLICT DO NOTHING`;
  const command = {
    orderId,
    accountId: otherId,
    role: "merchant_owner",
    idempotencyKey: randomUUID(),
    now,
    action: { kind: "accept", prepMinutes: 15 },
    expectedVersion: 1,
  } as const;
  const foreign = { ...command, accountId: customerId };
  expect(await orders().apply(foreign)).toEqual({ kind: "not_found" });
  const rival = { ...command, idempotencyKey: randomUUID() };
  const results = await Promise.all([orders().apply(command), orders().apply(rival)]);
  expect(results.map(({ kind }) => kind).sort()).toEqual(["applied", "order_conflict"]);
  const winner = results[0].kind === "applied" ? command : rival;
  const won = results.find(({ kind }) => kind === "applied");
  expect(won).toMatchObject({ kind: "applied", order: { status: "accepted", version: 2 } });
  expect(await orders().apply(winner)).toEqual(won);
  expect(await orders().apply({ ...winner, action: { kind: "accept", prepMinutes: 20 } })).toEqual({
    kind: "idempotency_conflict",
  });
  await orders().runTimer(orderId, "expire", new Date("2026-11-11T12:08:00Z"));
  expect(await sql`SELECT version, status FROM orders WHERE id = ${orderId}`).toEqual([
    { version: 2, status: "accepted" },
  ]);
  expect(await sql`SELECT FROM order_events WHERE order_id = ${orderId}`).toHaveLength(2);
});

test("[ORD-01] pickup can be marked ready and collected with a scoped order read", async () => {
  const request = await placement();
  const placed = await orders().place(request);
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const { sql } = database.get();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner') ON CONFLICT DO NOTHING`;
  const customer = { orderId, accountId: customerId, role: "customer" } as const;
  const merchant = { orderId, accountId: otherId, role: "merchant_owner" } as const;
  expect(await orders().read({ ...customer, accountId: otherId })).toBeUndefined();
  expect(await orders().read(customer)).toEqual(placed.order);
  const command = { ...merchant, now };
  expect(
    await orders().apply({
      ...command,
      idempotencyKey: randomUUID(),
      expectedVersion: 1,
      action: { kind: "accept", prepMinutes: 15 },
    }),
  ).toMatchObject({ kind: "applied" });
  expect(
    await orders().apply({
      ...command,
      idempotencyKey: randomUUID(),
      expectedVersion: 2,
      action: { kind: "markReady" },
    }),
  ).toMatchObject({ kind: "applied" });
  expect(
    await orders().apply({
      ...command,
      idempotencyKey: randomUUID(),
      expectedVersion: 3,
      action: { kind: "collect" },
    }),
  ).toMatchObject({ kind: "applied", order: { status: "collected" } });
  expect(
    await orders().apply({
      ...command,
      idempotencyKey: randomUUID(),
      expectedVersion: 4,
      action: { kind: "collect" },
    }),
  ).toEqual({ kind: "order_terminal" });
});

test("[ORD-02] customer can cancel only their pending order, and the timeout cannot undo it", async () => {
  const placed = await orders().place(await placement());
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const request = {
    orderId,
    accountId: customerId,
    role: "customer",
    idempotencyKey: randomUUID(),
    now,
    action: { kind: "cancel", reason: "Erreur de commande" },
    expectedVersion: 1,
  } as const;
  expect(await orders().apply({ ...request, accountId: otherId })).toEqual({ kind: "not_found" });
  expect(await orders().apply(request)).toMatchObject({
    kind: "applied",
    order: { status: "cancelled" },
  });
  await orders().runTimer(orderId, "expire", new Date("2026-11-11T12:08:00Z"));
  expect(await orders().read(request)).toMatchObject({ status: "cancelled", version: 2 });
});

test("[ORD-02] rejecting an order can mark only its ordered items sold out", async () => {
  const placed = await orders().place(await placement());
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const { sql } = database.get();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner') ON CONFLICT DO NOTHING`;
  const command = {
    orderId,
    accountId: otherId,
    role: "merchant_owner",
    idempotencyKey: randomUUID(),
    now,
    action: { kind: "reject", reason: "item_unavailable", soldOutItemIds: [randomUUID()] },
    expectedVersion: 1,
  } as const;
  expect(await orders().apply(command)).toEqual({ kind: "invalid_order_command" });
  try {
    expect(
      await orders().apply({ ...command, action: { ...command.action, soldOutItemIds: [itemId] } }),
    ).toMatchObject({ kind: "applied", order: { status: "rejected", version: 2 } });
    expect(await sql`SELECT is_available FROM items WHERE id = ${itemId}`).toEqual([
      { is_available: false },
    ]);
  } finally {
    await sql`UPDATE items SET is_available = true WHERE id = ${itemId}`;
  }
});

test("[ORD-02] a verified admin force action records its actor and reason", async () => {
  const placed = await orders().place(await placement());
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const { sql } = database.get();
  const command = {
    orderId,
    accountId: otherId,
    role: "admin",
    idempotencyKey: randomUUID(),
    now,
    action: { kind: "force", to: "cancelled", reason: "Assistance" },
    expectedVersion: 1,
  } as const;
  expect(await orders().apply(command)).toEqual({ kind: "not_found" });
  await sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${otherId}, decode('00', 'hex'))`;
  expect(await orders().apply(command)).toMatchObject({
    kind: "applied",
    order: { status: "cancelled" },
  });
  expect(await orders().apply(command)).toMatchObject({ kind: "applied", order: { version: 2 } });
  expect(
    await sql`
    SELECT actor_id, merchant_id, action, reason FROM audit_log WHERE order_id = ${orderId}
  `,
  ).toEqual([
    {
      actor_id: otherId,
      merchant_id: merchantId,
      action: "order_force_cancelled",
      reason: "Assistance",
    },
  ]);
  expect(
    await sql`SELECT actor_kind, actor_id, payload FROM order_events WHERE order_id = ${orderId} AND version = 2`,
  ).toEqual([
    { actor_kind: "admin", actor_id: otherId, payload: { kind: "force", reason: "Assistance" } },
  ]);
});

test("[MER-03][RT-02] board snapshot and replay are scoped and replay every new order in commit order", async () => {
  const { sql } = database.get();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner') ON CONFLICT DO NOTHING`;
  const input = { merchantId, accountId: otherId };
  expect(await orders().board({ ...input, accountId: customerId })).toBeUndefined();
  const before = await orders().board(input);
  if (!before) throw new Error("Expected board");
  expect(before.events).toEqual([]);

  const [first, second] = await Promise.all([placement(), placement()]);
  const created = await Promise.all([orders().place(first), orders().place(second)]);
  const ids = created.flatMap((result) => (result.kind === "placed" ? [result.order.orderId] : []));
  expect(ids).toHaveLength(2);
  const changed = await orders().board({ ...input, after: before.cursor });
  if (!changed) throw new Error("Expected board");
  expect(changed.events.map(({ orderId }) => orderId).sort()).toEqual(ids.sort());
  expect(changed.events.map(({ id }) => BigInt(id))).toEqual([
    BigInt(before.cursor) + 1n,
    BigInt(before.cursor) + 2n,
  ]);
  expect(changed.hasMore).toBe(false);
  expect(changed.orders.filter(({ orderId }) => ids.includes(orderId))).toMatchObject([
    { fulfilment: "pickup", lines: [{ names: { fr: "Couscous" }, quantity: 2 }], changeDzd: 0 },
    { fulfilment: "pickup", lines: [{ names: { fr: "Couscous" }, quantity: 2 }], changeDzd: 0 },
  ]);
  expect((await orders().board({ ...input, after: changed.cursor }))?.events).toEqual([]);
});

async function fixtureStandardSession(userId: string, at = new Date()) {
  const sessionId = randomUUID();
  await createAuthRepository(database.get()).transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId,
      tokenHash: randomBytes(32),
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.7",
      deviceName: "Fixture",
      now: at,
    }),
  );
  return sessionId;
}

async function verifyBuyerTracking(
  orderId: string,
  driver: { userId: string; sessionId: string },
  capturedAt: string,
) {
  const buyerSessionId = await fixtureStandardSession(customerId);
  expect(
    await orders().tracking({ orderId, customerId: driver.userId, sessionId: driver.sessionId }),
  ).toBeUndefined();
  const tracking = await orders().tracking({ orderId, customerId, sessionId: buyerSessionId });
  expect(tracking).toMatchObject({
    fulfilment: "delivery",
    order: { status: "out_for_delivery" },
    destination: { latitude: 36.751, longitude: 3.0625 },
    courier: {
      phone: "+213500000017",
      position: { latitude: 36.75, longitude: 3.0625, heading: 45, capturedAt },
    },
  });
  expect(tracking).toMatchObject({
    deliveryCode: deriveDeliveryCode(Buffer.alloc(32, 7), orderId),
  });
  expect(tracking?.timeline.map(({ status }) => status)).toEqual([
    "pending_acceptance",
    "accepted",
    "ready",
    "out_for_delivery",
  ]);
  const replay = await orders().orderReplay({
    orderId,
    accountId: customerId,
    sessionId: buyerSessionId,
    role: "standard",
    after: "5",
  });
  expect(replay).toMatchObject({ events: [], position: { orderId, capturedAt } });
}

async function verifyDeliveryCode(orderId: string, driverId: string, mode: "deliver" | "lock") {
  const { sql } = database.get();
  const [{ delivery_code_digest: digest } = {}] = await sql`SELECT delivery_code_digest
    FROM public.orders WHERE id = ${orderId}`;
  expect(digest).toBeInstanceOf(Uint8Array);
  const code = deriveDeliveryCode(Buffer.alloc(32, 7), orderId);
  const wrong = code === "0000" ? "1111" : "0000";
  const delivery = {
    orderId,
    accountId: driverId,
    role: "standard",
    expectedVersion: 5,
    now: new Date(),
    idempotencyKey: randomUUID(),
    action: { kind: "deliver", code: wrong },
  } as const;
  expect(await orders().apply({ ...delivery, accountId: customerId })).toEqual({
    kind: "not_found",
  });
  const attempts = await Promise.all([orders().apply(delivery), orders().apply(delivery)]);
  expect(attempts).toEqual(Array(2).fill({ kind: "invalid_delivery_code" }));
  const correct = {
    ...delivery,
    action: { kind: "deliver", code },
    idempotencyKey: randomUUID(),
  } as const;
  expect(await orders().apply({ ...correct, idempotencyKey: delivery.idempotencyKey })).toEqual({
    kind: "idempotency_conflict",
  });
  if (mode === "lock") {
    for (let attempt = 2; attempt <= 5; attempt++) {
      expect(await orders().apply({ ...delivery, idempotencyKey: randomUUID() })).toEqual({
        kind: attempt === 5 ? "delivery_code_locked" : "invalid_delivery_code",
      });
    }
    expect(await orders().apply(correct)).toEqual({ kind: "delivery_code_locked" });
    expect(await orders().apply(delivery)).toEqual({ kind: "invalid_delivery_code" });
    return;
  }
  const [first, replay] = await Promise.all([orders().apply(correct), orders().apply(correct)]);
  expect(first).toMatchObject({ kind: "applied", order: { status: "delivered", version: 6 } });
  expect(replay).toEqual(first);
  const [finished] =
    await sql`SELECT delivery_code_digest, delivery_code_attempts FROM public.orders WHERE id = ${orderId}`;
  expect(finished).toMatchObject({ delivery_code_digest: null, delivery_code_attempts: 1 });
  expect(
    await sql`SELECT FROM public.order_events WHERE order_id = ${orderId} AND to_status = 'delivered'`,
  ).toHaveLength(1);
}

async function verifyCourierPositions(
  orderId: string,
  driver: { userId: string; sessionId: string },
) {
  const databaseConnection = database.get();
  const { sql } = databaseConnection;
  const repo = createCourierRepository(databaseConnection);
  const capturedAt = new Date().toISOString();
  const position = { latitude: 36.75, longitude: 3.0625, accuracyM: 15, heading: 45, capturedAt };
  const input = { ...driver, orderId, now: new Date(capturedAt), positions: [position] };
  expect(await repo.recordPositions({ ...input, userId: customerId })).toEqual({
    kind: "not_found",
  });
  const signal = Promise.withResolvers<string>();
  const listener = await sql.listen("courier_position_events", signal.resolve);
  try {
    const responses = await Promise.all([repo.recordPositions(input), repo.recordPositions(input)]);
    expect(responses).toContainEqual({ kind: "recorded", accepted: 1 });
    expect(responses).toContainEqual({ kind: "rate_limited" });
    expect(await signal.promise).toBe(orderId);
  } finally {
    await listener.unlisten();
  }
  expect(
    await repo.recordPositions({ ...input, now: new Date(Date.parse(capturedAt) + 5_000) }),
  ).toEqual({ kind: "recorded", accepted: 0 });
  const [latest] = await sql`SELECT ST_Y(location::geometry) AS latitude, heading
    FROM public.courier_positions WHERE order_id = ${orderId}`;
  expect(latest).toEqual({ latitude: 36.75, heading: 45 });
  await verifyBuyerTracking(orderId, driver, capturedAt);
  const at = Date.parse(capturedAt);
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  await pruneCourierPositions(sql, new Date(at + thirtyDays - 1));
  expect(await sql`SELECT FROM public.courier_positions WHERE order_id = ${orderId}`).toHaveLength(
    1,
  );
  await pruneCourierPositions(sql, new Date(at + thirtyDays));
  expect(await sql`SELECT FROM public.courier_positions WHERE order_id = ${orderId}`).toHaveLength(
    0,
  );
}

async function verifyFailedDelivery(
  orderId: string,
  driver: { userId: string; sessionId: string },
) {
  const courier = createCourierRepository(database.get());
  const started = new Date();
  const base = { ...driver, orderId, now: started };
  const fail = (offset: number) =>
    orders().apply({
      orderId,
      accountId: driver.userId,
      role: "standard",
      expectedVersion: 5,
      now: new Date(started.getTime() + offset),
      idempotencyKey: randomUUID(),
      action: { kind: "fail", reason: "Recipient unavailable" },
    });
  expect(await fail(0)).toEqual({ kind: "invalid_order_command" });
  const arrival = { ...base, action: "start_wait", idempotencyKey: randomUUID() } as const;
  expect(await courier.recordDeliveryAttempt({ ...arrival, userId: customerId })).toEqual({
    kind: "not_found",
  });
  expect(await courier.recordDeliveryAttempt(arrival)).toEqual({
    kind: "recorded",
    state: { waitStartedAt: started.toISOString(), callAttempts: 0 },
  });
  const firstCall = { ...base, action: "call", idempotencyKey: randomUUID() } as const;
  const [first, repeat] = await Promise.all([
    courier.recordDeliveryAttempt(firstCall),
    courier.recordDeliveryAttempt(firstCall),
  ]);
  expect(first).toMatchObject({ kind: "recorded", state: { callAttempts: 1 } });
  expect(repeat).toEqual(first);
  expect(
    await courier.recordDeliveryAttempt({ ...firstCall, idempotencyKey: randomUUID() }),
  ).toEqual({ kind: "rate_limited" });
  expect(await fail(600_000)).toEqual({ kind: "order_not_due" });
  expect(
    await courier.recordDeliveryAttempt({
      ...firstCall,
      idempotencyKey: randomUUID(),
      now: new Date(started.getTime() + 60_000),
    }),
  ).toMatchObject({ kind: "recorded", state: { callAttempts: 2 } });
  expect(await courier.jobs(driver)).toMatchObject({
    jobs: [
      {
        order: { orderId },
        deliveryAttempt: { waitStartedAt: started.toISOString(), callAttempts: 2 },
      },
    ],
  });
  expect(await fail(599_999)).toEqual({ kind: "order_not_due" });
  expect(await fail(600_000)).toMatchObject({
    kind: "applied",
    order: { status: "delivery_failed", version: 6 },
  });
  expect(
    await courier.recordDeliveryAttempt({ ...firstCall, idempotencyKey: randomUUID() }),
  ).toEqual({ kind: "not_found" });
}

async function prepareCourierDelivery({
  addressId,
  courierId,
}: {
  addressId: string;
  courierId: string;
}) {
  const locked = await orders().place(
    await placement({ ...pickup, fulfilment: "delivery", addressId }),
  );
  if (locked.kind !== "placed") throw new Error("Expected second placement");
  for (const [expectedVersion, action] of [
    [1, { kind: "accept", prepMinutes: 15 }],
    [2, { kind: "markReady" }],
    [3, { kind: "assignCourier", courierId }],
    [4, { kind: "pickUp" }],
  ] as const) {
    expect(
      await orders().apply({
        accountId: otherId,
        role: "merchant_owner",
        now,
        orderId: locked.order.orderId,
        expectedVersion,
        idempotencyKey: randomUUID(),
        action,
      }),
    ).toMatchObject({ kind: "applied" });
  }
  return locked.order.orderId;
}

async function verifyPhotoFallback({
  addressId,
  courierId,
  driver,
}: {
  addressId: string;
  courierId: string;
  driver: { userId: string; sessionId: string };
}) {
  const orderId = await prepareCourierDelivery({ addressId, courierId });
  const anotherOrder = await prepareCourierDelivery({ addressId, courierId });
  const { sql } = database.get();
  const media = createMediaRepository(database.get());
  const at = new Date();
  const scope = { accountId: driver.userId, sessionId: driver.sessionId, now: at };
  const input = { kind: "delivery_proof", orderId, contentType: "image/png", bytes: 16 } as const;
  const request = {
    ...scope,
    input,
    idempotencyKeyHash: randomBytes(32),
    requestHash: randomBytes(32),
  };
  expect(await media.reserve({ ...request, accountId: customerId })).toEqual({ kind: "not_found" });
  const reserved = await media.reserve(request);
  if (!("media" in reserved)) throw new Error("Expected proof reservation");
  expect(reserved.media.kind).toBe("delivery_proof");
  expect(await media.findUpload({ ...scope, mediaId: reserved.media.mediaId })).toEqual({
    contentType: "image/png",
    bytes: 16,
  });
  const [cleanup] = await sql`SELECT run_at FROM graphile_worker.jobs
    WHERE key = ${"privacy:purge-delivery-proof:" + reserved.media.mediaId}`;
  expect(Date.parse(String(cleanup?.run_at))).toBeGreaterThan(
    at.getTime() + 29 * 24 * 60 * 60 * 1_000,
  );

  const photoId = randomUUID();
  await seedReadyPhoto(sql, {
    mediaId: photoId,
    accountId: driver.userId,
    merchantId,
    kind: "delivery_proof",
    now: at,
    deliveryOrderId: orderId,
  });
  const command = {
    orderId,
    accountId: driver.userId,
    role: "standard",
    expectedVersion: 5,
    now: at,
    idempotencyKey: randomUUID(),
    action: { kind: "deliverPhoto", photoId, reason: "Code unavailable" },
  } as const;
  expect(await orders().apply({ ...command, orderId: anotherOrder })).toEqual({
    kind: "invalid_order_command",
  });
  expect(await orders().apply(command)).toMatchObject({
    kind: "applied",
    order: { status: "delivered" },
  });
  const board = await orders().board({ merchantId, accountId: otherId });
  expect(board?.deliveryProofs).toMatchObject([{ orderId, photoId, reason: "Code unavailable" }]);
  const [event] =
    await sql`SELECT payload FROM public.order_events WHERE order_id = ${orderId} AND to_status = 'delivered'`;
  expect(event).toMatchObject({ payload: { proof: { kind: "photo", photoId } } });
  const merchantScope = {
    accountId: otherId,
    sessionId: await fixtureStandardSession(otherId, at),
    now: at,
    mediaId: photoId,
  };
  expect(await media.read(merchantScope)).toMatchObject({
    kind: "delivery_proof",
    status: "ready",
  });
  expect(await media.findVariant({ ...merchantScope, format: "webp", width: 640 })).toEqual({
    key: `variants/${photoId}/640.webp`,
  });
  expect(await media.read({ ...scope, mediaId: photoId })).toBeUndefined();
  expect(
    await media.read({
      accountId: customerId,
      sessionId: await fixtureStandardSession(customerId, at),
      now: at,
      mediaId: photoId,
    }),
  ).toBeUndefined();
  const claimed = await media.claimDeliveryProof(photoId);
  expect(claimed?.keys).toContain("quarantine/" + photoId);
  expect(
    (await orders().board({ merchantId, accountId: otherId }))?.deliveryProofs,
  ).toBeUndefined();
  await media.finishDeliveryProof(photoId);
  expect(await media.claimDeliveryProof(photoId)).toBeUndefined();
  const [scrubbed] =
    await sql`SELECT payload FROM public.order_events WHERE order_id = ${orderId} AND to_status = 'delivered'`;
  expect(scrubbed).toEqual({ payload: { kind: "deliver", proof: { kind: "photo" } } });
}

test("[MER-03][COU-02] assigns only an active restaurant courier and exposes their delivery", async () => {
  const addressId = await saveAddress(36.751);
  const placed = await orders().place(
    await placement({ ...pickup, fulfilment: "delivery", addressId }),
  );
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const { sql } = database.get();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner') ON CONFLICT DO NOTHING`;
  const auth = createAuthRepository(database.get());
  const signedAt = new Date();
  const driver = await auth.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164: "+213500000017", now: signedAt }),
  );
  const sessionId = randomUUID();
  await auth.transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId: driver.id,
      tokenHash: randomBytes(32),
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.7",
      deviceName: "Fixture",
      now: signedAt,
    }),
  );
  const courierId = randomUUID();
  const foreignId = randomUUID();
  const foreignMerchantId = randomUUID();
  await sql`INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    SELECT ${foreignMerchantId}, 'fixture-other-orders', restaurant_name, owner_name, phone_e164,
      commune_id, location, cuisines, status, created_at FROM merchants WHERE id = ${merchantId}`;
  await sql`INSERT INTO couriers (id, user_id, merchant_id, created_at) VALUES
    (${courierId}, ${driver.id}, ${merchantId}, now()), (${foreignId}, ${customerId}, ${foreignMerchantId}, now())`;

  const merchant = { orderId, accountId: otherId, role: "merchant_owner", now } as const;
  const apply = (
    expectedVersion: number,
    action: Parameters<ReturnType<typeof orders>["apply"]>[0]["action"],
  ) => orders().apply({ ...merchant, idempotencyKey: randomUUID(), expectedVersion, action });
  const jobs = createCourierRepository(database.get()).jobs;
  const driverSession = { userId: driver.id, sessionId };
  expect(await jobs(driverSession)).toMatchObject({ jobs: [], online: false });
  expect(await jobs({ ...driverSession, userId: customerId })).toBeUndefined();
  expect(await apply(1, { kind: "accept", prepMinutes: 15 })).toMatchObject({ kind: "applied" });
  expect(await apply(2, { kind: "markReady" })).toMatchObject({ kind: "applied" });
  expect(await apply(3, { kind: "pickUp" })).toEqual({ kind: "invalid_order_transition" });
  expect(await apply(3, { kind: "assignCourier", courierId: foreignId })).toEqual({
    kind: "invalid_order_command",
  });
  const assign = {
    ...merchant,
    idempotencyKey: randomUUID(),
    expectedVersion: 3,
    action: { kind: "assignCourier", courierId },
  } as const;
  const [first, second] = await Promise.all([orders().apply(assign), orders().apply(assign)]);
  expect(first).toMatchObject({ kind: "applied", order: { version: 4, status: "ready" } });
  expect(second).toEqual(first);
  const board = await orders().board({ merchantId, accountId: otherId });
  expect(board?.orders.find((ticket) => ticket.orderId === orderId)).toMatchObject({
    canHandover: true,
  });
  const assigned = await jobs(driverSession);
  expect(assigned?.jobs).toMatchObject([
    {
      order: { orderId, totalDzd: 1137, status: "ready" },
      pickup: { restaurantName: "Table fictive", pin: { latitude: 36.75, longitude: 3.0625 } },
      dropoff: { pin: { latitude: 36.751, longitude: 3.0625 } },
      customerPhone: "+213500000001",
      changeDzd: 0,
    },
  ]);
  const dropoff = assigned?.jobs[0]?.dropoff;
  expect(dropoff).not.toHaveProperty("addressId");
  expect(dropoff).not.toHaveProperty("label");
  expect(
    await orders().apply({
      ...merchant,
      accountId: driver.id,
      role: "standard",
      expectedVersion: 4,
      idempotencyKey: randomUUID(),
      action: { kind: "pickUp" },
    }),
  ).toMatchObject({ kind: "applied", order: { status: "out_for_delivery", version: 5 } });
  expect((await jobs(driverSession))?.jobs[0]?.order.status).toBe("out_for_delivery");
  await verifyCourierPositions(orderId, driverSession);
  await verifyDeliveryCode(orderId, driver.id, "deliver");
  const lockedOrder = await prepareCourierDelivery({ addressId, courierId });
  await verifyDeliveryCode(lockedOrder, driver.id, "lock");
  await verifyFailedDelivery(lockedOrder, driverSession);
  await verifyPhotoFallback({ addressId, courierId, driver: driverSession });
  expect(
    (await orders().board({ merchantId, accountId: otherId }))?.orders.some(
      (ticket) => ticket.orderId === orderId,
    ),
  ).toBe(false);
});

test("[RT-03] committed order events wake the restaurant stream and require a live session for replay", async () => {
  const { sql } = database.get();
  const sessionId = randomUUID();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner') ON CONFLICT DO NOTHING`;
  await createAuthRepository(database.get()).transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId: otherId,
      tokenHash: randomBytes(32),
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.4",
      deviceName: "Fixture",
      now: new Date(),
    }),
  );
  const scope = { merchantId, accountId: otherId, sessionId, after: undefined };
  const before = await orders().merchantReplay(scope);
  if (!before) throw new Error("Expected authorized replay");

  const signal = Promise.withResolvers<string>();
  const listener = await sql.listen("merchant_order_events", signal.resolve);
  try {
    const request = await placement();
    const placed = await orders().place(request);
    if (placed.kind !== "placed") throw new Error("Expected placement");
    expect(await signal.promise).toBe(merchantId);
    expect(
      (await orders().merchantReplay({ ...scope, after: before.cursor }))?.events,
    ).toMatchObject([{ orderId: placed.order.orderId, status: "pending_acceptance" }]);
    await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}`;
    expect(await orders().merchantReplay(scope)).toBeUndefined();
  } finally {
    await listener.unlisten();
  }
});

test("[CUS-18][RT-02] customer replays only their order and session", async () => {
  const { sql } = database.get();
  const sessionId = randomUUID();
  await createAuthRepository(database.get()).transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId: customerId,
      tokenHash: randomBytes(32),
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.4",
      deviceName: "Fixture",
      now: new Date(),
    }),
  );
  const placed = await orders().place(await placement());
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const scope = { orderId, accountId: customerId, sessionId, role: "customer" } as const;
  expect(await orders().orderReplay({ ...scope, accountId: otherId })).toBeUndefined();
  expect(await orders().orderReplay(scope)).toEqual({ cursor: "1", events: [], hasMore: false });
  const signal = Promise.withResolvers<string>();
  const listener = await sql.listen("order_status_events", signal.resolve);
  try {
    await orders().runTimer(orderId, "expire", new Date("2026-11-11T12:08:00Z"));
    expect(await signal.promise).toBe(orderId);
    expect(await orders().orderReplay({ ...scope, after: "1" })).toEqual({
      cursor: "2",
      hasMore: false,
      events: [{ id: "2", orderId, version: 2, status: "expired", at: "2026-11-11T12:08:00.000Z" }],
    });
  } finally {
    await listener.unlisten();
  }
});

test("[NOT-01] a committed order update queues web push once for an opted-in customer", async () => {
  const { sql } = database.get();
  const sessionId = randomUUID();
  await createAuthRepository(database.get()).transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId: customerId,
      tokenHash: randomBytes(32),
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.4",
      deviceName: "Fixture",
      now: new Date(),
    }),
  );
  await sql`
    INSERT INTO push_subscriptions (endpoint, user_id, session_id, p256dh, auth_key)
    VALUES ('https://fcm.googleapis.com/fcm/send/fixture', ${customerId}, ${sessionId}, 'B' || repeat('A', 86), repeat('A', 22))
  `;
  const placed = await orders().place(await placement());
  if (placed.kind !== "placed") throw new Error("Expected placement");
  const { orderId } = placed.order;
  const deadline = new Date("2026-11-11T12:08:00Z");
  await Promise.all([
    orders().runTimer(orderId, "expire", deadline),
    orders().runTimer(orderId, "expire", deadline),
  ]);
  expect(
    await sql`SELECT task_identifier FROM graphile_worker.jobs WHERE key = ${"order:push:" + orderId + ":2"}`,
  ).toEqual([{ task_identifier: "order.push" }]);
});

test("[CUS-10][MON-07] email-only checkout requires an order contact and keeps the cash cap", async () => {
  const emailOnly = randomUUID();
  const contactPhone = "+213600000040";
  const { sql } = database.get();
  await sql`INSERT INTO public.users (id, email, created_at) VALUES (${emailOnly}, 'checkout@example.test', ${now.toISOString()})`;
  async function request(input = pickup) {
    const priced = await repo().create({ customerId: emailOnly, input, now });
    if (priced.kind !== "quoted") throw new Error("Expected an email account to receive a quote.");
    return {
      customerId: emailOnly,
      now,
      input: { quoteId: priced.quote.quoteId },
      idempotencyKey: randomUUID(),
    };
  }
  const missing = await request();
  expect(await orders().place(missing)).toEqual({ kind: "contact_phone_required" });
  const withContact = { ...missing, input: { ...missing.input, contactPhone } };
  const placed = await orders().place(withContact);
  if (placed.kind !== "placed") throw new Error("Expected an order with a contact phone.");
  expect(await orders().place(withContact)).toEqual(placed);
  expect(
    await orders().place({
      ...withContact,
      input: { ...withContact.input, contactPhone: "+213600000041" },
    }),
  ).toEqual({ kind: "idempotency_conflict" });
  const [stored] = await sql`
    SELECT orders.contact_phone_e164, users.phone_e164 FROM public.orders
    JOIN public.users ON users.id = orders.customer_id WHERE orders.id = ${placed.order.orderId}
  `;
  expect(stored).toEqual({ contact_phone_e164: contactPhone, phone_e164: null });
  await sql`INSERT INTO public.merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${otherId}, 'owner') ON CONFLICT DO NOTHING`;
  const board = await orders().board({ merchantId, accountId: otherId });
  expect(board?.orders.find(({ orderId }) => orderId === placed.order.orderId)?.customerPhone).toBe(
    contactPhone,
  );
  const sessionId = await fixtureStandardSession(emailOnly, now);
  const exported = await createPrivacyRepository(database.get()).exportAccount({
    userId: emailOnly,
    sessionId,
    now,
  });
  expect(exported?.orderContacts).toEqual([
    { orderId: placed.order.orderId, phoneE164: contactPhone },
  ]);

  const expensive = await request({ ...pickup, items: [{ itemId, quantity: 13, optionIds: [] }] });
  expect(
    await orders().place({ ...expensive, input: { ...expensive.input, contactPhone } }),
  ).toEqual({ kind: "cash_limit" });
});

test.each([
  { limit: "maxUsesTotal", scope: "across customers", customers: () => [customerId, otherId] },
  {
    limit: "maxUsesPerCustomer",
    scope: "for one customer",
    customers: () => [customerId, customerId],
  },
])(
  "[CUS-16][MON-03] reserves the last use once $scope and replays placement",
  async ({ limit, customers }) => {
    const { sql } = database.get();
    const offerId = randomUUID();
    const code = limit === "maxUsesTotal" ? "AWID" : "PERSONALAWID";
    await sql`INSERT INTO promotions (id, merchant_id, code, discount, conditions, created_at, updated_at)
    VALUES (${offerId}, ${merchantId}, ${code}, '{"kind":"fixed","amountDzd":200}',
      ${JSON.stringify({ [limit]: 1 })}, ${now.toISOString()}, ${now.toISOString()})`;
    const input = { ...pickup, promotionCode: code.toLowerCase() };
    const requests = await Promise.all(
      customers().map(async (customerId) => {
        const result = await repo().create({ customerId, input, now });
        expect(result).toMatchObject({
          kind: "quoted",
          quote: { discountDzd: 200, totalDzd: 800 },
        });
        if (result.kind !== "quoted") throw new Error("Expected discounted quote");
        return {
          customerId,
          input: { quoteId: result.quote.quoteId },
          now,
          idempotencyKey: randomUUID(),
        };
      }),
    );
    const results = await Promise.all(requests.map((request) => orders().place(request)));
    expect(results.map(({ kind }) => kind).sort()).toEqual(["placed", "quote_changed"]);
    const winner = requests[results.findIndex(({ kind }) => kind === "placed")];
    if (!winner) throw new Error("Expected a winning placement");
    expect(await orders().place(winner)).toEqual(results.find(({ kind }) => kind === "placed"));
    expect(
      await sql`SELECT sales_dzd FROM promotion_redemptions WHERE promotion_id = ${offerId}`,
    ).toEqual([{ sales_dzd: 800 }]);
    expect(await repo().create({ customerId: winner.customerId, input, now })).toEqual({
      kind: "promotion_used_up",
    });
    if (limit === "maxUsesPerCustomer") {
      expect(await repo().create({ customerId: otherId, input, now })).toMatchObject({
        kind: "quoted",
        quote: { discountDzd: 200 },
      });
    }
  },
);

test("[CUS-16] checks offer conditions and applies only the best automatic saving", async () => {
  const { sql } = database.get();
  const cases = [
    ["EXPIRED", { endsOn: "2026-11-10" }, "promotion_expired"],
    ["MINIMUM", { minimumSubtotalDzd: 1001 }, "promotion_below_minimum"],
    ["PERSONAL", { maxUsesPerCustomer: 0 }, "promotion_used_up"],
    ["UNKNOWN", null, "promotion_wrong_restaurant"],
  ] as const;
  for (const [code, conditions, kind] of cases) {
    if (conditions !== null) {
      await sql`INSERT INTO promotions (merchant_id, code, discount, conditions, created_at, updated_at)
        VALUES (${merchantId}, ${code}, '{"kind":"fixed","amountDzd":200}',
          ${JSON.stringify(conditions)}::jsonb, ${now.toISOString()}, ${now.toISOString()})`;
    }
    expect(
      await repo().create({ customerId, input: { ...pickup, promotionCode: code }, now }),
    ).toEqual({ kind });
  }
  await sql`INSERT INTO promotions (merchant_id, discount, conditions, created_at, updated_at)
    VALUES (${merchantId}, '{"kind":"fixed","amountDzd":100}', '{}', now(), now()),
      (${merchantId}, '{"kind":"percent","basisPoints":3000,"capDzd":250}', '{}', now(), now()),
      (${merchantId}, '{"kind":"free_delivery"}', '{}', now(), now())`;
  expect(await repo().create({ customerId, input: pickup, now })).toMatchObject({
    kind: "quoted",
    quote: { discountDzd: 250, totalDzd: 750 },
  });
});

test("[MON-03] a free delivery code does not spend its last use on pickup", async () => {
  const { sql } = database.get();
  const offerId = randomUUID();
  await sql`INSERT INTO promotions (id, merchant_id, code, discount, conditions, created_at, updated_at)
    VALUES (${offerId}, ${merchantId}, 'SHIP', '{"kind":"free_delivery"}', '{"maxUsesTotal":1}', now(), now())`;
  const request = async (input: z.infer<typeof orderQuoteInput>) => {
    const result = await repo().create({
      customerId,
      input: { ...input, promotionCode: "SHIP" },
      now,
    });
    if (result.kind !== "quoted") throw new Error("Expected quote");
    const order = await orders().place({
      customerId,
      input: { quoteId: result.quote.quoteId },
      now,
      idempotencyKey: randomUUID(),
    });
    expect(order.kind).toBe("placed");
    return result.quote;
  };
  expect(await request(pickup)).toMatchObject({ totalDzd: 1000 });
  expect(await sql`SELECT 1 FROM promotion_redemptions WHERE promotion_id = ${offerId}`).toEqual(
    [],
  );
  const addressId = await saveAddress(36.751);
  expect(await request({ ...pickup, fulfilment: "delivery", addressId })).toMatchObject({
    deliveryFeeDzd: 0,
    totalDzd: 1000,
  });
  expect(
    await sql`SELECT 1 FROM promotion_redemptions WHERE promotion_id = ${offerId}`,
  ).toHaveLength(1);
});

test("[CUS-16] first-order eligibility ignores orders at other restaurants", async () => {
  const { sql } = database.get();
  const newcomer = randomUUID();
  const foreignMerchant = randomUUID();
  await sql`INSERT INTO users (id, phone_e164, created_at) VALUES (${newcomer}, '+213500000031', now())`;
  await sql`INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
    location, cuisines, status, created_at)
    SELECT ${foreignMerchant}, 'fixture-other-order', 'Table ailleurs', owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at FROM merchants WHERE id = ${merchantId}`;
  const seedOrder = async (restaurant: string, shortCode: string) => {
    await sql`INSERT INTO orders (id, quote_id, customer_id, merchant_id, restaurant_name, short_code,
      order_day, status, fulfilment, version, placed_at, last_event_at, subtotal_dzd,
      delivery_fee_dzd, total_dzd, paying_with_dzd, lines)
      VALUES (${randomUUID()}, ${randomUUID()}, ${newcomer}, ${restaurant}, 'Fixture', ${shortCode},
        '2026-11-11', 'collected', 'pickup', 1, now(), now(), 500, 0, 500, 500, '[]')`;
  };
  await seedOrder(foreignMerchant, "AWD-3A3");
  await sql`INSERT INTO promotions (merchant_id, code, discount, conditions, created_at, updated_at)
    VALUES (${merchantId}, 'FIRST', '{"kind":"fixed","amountDzd":200}', '{"firstOrderOnly":true}', now(), now())`;
  const quote = () =>
    repo().create({ customerId: newcomer, input: { ...pickup, promotionCode: "FIRST" }, now });
  expect(await quote()).toMatchObject({ kind: "quoted", quote: { totalDzd: 800 } });
  await seedOrder(merchantId, "AWD-3A4");
  expect(await quote()).toEqual({ kind: "promotion_used_up" });
});
