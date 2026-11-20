import { randomBytes, randomUUID } from "node:crypto";
import { createAuthRepository } from "@zaafran/db/auth";
import { createOrderRepository } from "@zaafran/db/orders";
import { runMigrations } from "graphile-worker";
import { expect, onTestFinished, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { openDatabase } from "../../../packages/db/src/database.ts";
import { createApi } from "../src/app.ts";
import { hashSessionToken } from "../src/auth-crypto.ts";
import { createAuthService } from "../src/auth-service.ts";

const database = registerTestDatabase();
const publicOrigin = "https://awid.test";
const now = new Date();

async function standardSession(phoneE164: string) {
  const repository = createAuthRepository(database.get());
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  if (!tokenHash) throw new Error("Expected a valid token");
  const user = await repository.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164, now }),
  );
  await repository.transaction((tx) =>
    tx.insertSession({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.15",
      deviceName: "Fixture",
      now,
    }),
  );
  const headers = {
    cookie: "__Host-session=" + token,
    origin: publicOrigin,
    "sec-fetch-site": "same-origin",
  };
  return { userId: user.id, headers };
}

async function seedOrder(customerId: string, merchantUserId: string, otherOwnerId: string) {
  const { sql } = database.get();
  const merchantId = randomUUID();
  const orderId = randomUUID();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  await sql`
    WITH commune AS (
      INSERT INTO communes (code, wilaya_code, name_ar, name_fr, centroid)
      VALUES ('1699', 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3 36)')) RETURNING id
    )
    INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    SELECT ${merchantId}, 'fixture-board', 'Test', 'Synthetic owner', '+213500000000', id,
      ST_GeogFromText('SRID=4326;POINT(3 36)'), ARRAY['algerian'], 'active', now()
    FROM commune
  `;
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${merchantUserId}, 'owner')`;
  await sql`
    WITH other_restaurant AS (
      INSERT INTO merchants (slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      SELECT 'fixture-other-tenant', restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at
      FROM merchants WHERE id = ${merchantId} RETURNING id
    )
    INSERT INTO merchant_members (merchant_id, user_id, role)
    SELECT id, ${otherOwnerId}, 'owner' FROM other_restaurant
  `;
  await sql`
    INSERT INTO orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day, status, fulfilment,
      version, placed_at, last_event_at, acceptance_deadline_at, subtotal_dzd, delivery_fee_dzd,
      total_dzd, paying_with_dzd, lines
    )
    VALUES (${orderId}, ${randomUUID()}, ${customerId}, ${merchantId}, 'Test', 'AAA-222', current_date,
      'pending_acceptance', 'pickup', 1, ${now.toISOString()}, ${now.toISOString()},
      ${new Date(now.getTime() + 60_000).toISOString()}, 1000, 0, 1000, 1000, '[]')
  `;
  return { merchantId, orderId };
}

test("[AUTH-06][MER-03] real standard session cookies reach the board only for merchant members", async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const [owner, customer, outsider] = await Promise.all([
    standardSession("+213500000001"),
    standardSession("+213500000002"),
    standardSession("+213500000003"),
  ]);
  const { merchantId, orderId } = await seedOrder(customer.userId, owner.userId, outsider.userId);
  const repository = createOrderRepository(database.get());
  const auth = createAuthService({
    repository: createAuthRepository(database.get()),
    otpKey: randomBytes(32),
    totpKey: randomBytes(32),
    now: () => now,
    sendSms: () => undefined,
  });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    auth: { service: auth, publicOrigin },
    merchantBoard: repository,
    orderTracking: repository.tracking,
    orderHistory: repository,
    orderActions: { repository, now: () => now },
    realtime: {
      async replay(scope) {
        return scope.after === "0" ? repository.merchantReplay(scope) : undefined;
      },
      async replayOrder(scope) {
        return scope.after === "0" ? repository.orderReplay(scope) : undefined;
      },
      subscribe(_merchantId, wake) {
        wake();
        return () => undefined;
      },
      subscribeOrder(_orderId, wake) {
        wake();
        return () => undefined;
      },
    },
  });
  onTestFinished(() => api.close());
  const board = `/v1/merchants/${merchantId}/order-board`;
  expect((await api.inject({ url: board, headers: owner.headers })).statusCode).toBe(200);
  expect((await api.inject({ url: board, headers: customer.headers })).statusCode).toBe(404);
  const url = `/v1/orders/${orderId}`;
  expect((await api.inject({ url: board, headers: outsider.headers })).statusCode).toBe(404);
  for (const privateUrl of [url + "/tracking", "/v1/me/orders/" + orderId + "/receipt"]) {
    const allowed = await api.inject({ url: privateUrl, headers: customer.headers });
    const denied = await api.inject({ url: privateUrl, headers: outsider.headers });
    expect(allowed.statusCode).toBe(200);
    expect(denied.statusCode).toBe(404);
    expect(denied.body).not.toContain(orderId);
  }
  expect((await api.inject({ url, headers: outsider.headers })).statusCode).toBe(404);
  expect((await api.inject({ url, headers: owner.headers })).statusCode).toBe(200);
  expect((await api.inject({ url, headers: customer.headers })).statusCode).toBe(200);
  const accept = (headers: typeof owner.headers) =>
    api.inject({
      url: url + "/accept",
      method: "POST",
      headers: { ...headers, "idempotency-key": "fixture-accept" },
      payload: { expectedVersion: 1, prepMinutes: 15 },
    });
  expect((await accept(customer.headers)).statusCode).toBe(404);
  const lockDatabase = openDatabase(database.url());
  const locked = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const lockTransaction = lockDatabase.sql.begin(async (tx) => {
    await tx`SELECT id FROM public.orders WHERE id = ${orderId} FOR UPDATE`;
    locked.resolve(undefined);
    await release.promise;
  });
  await locked.promise;
  const outsiderRequest = accept(outsider.headers);
  try {
    const response = await Promise.race([
      outsiderRequest,
      new Promise<undefined>((resolve) => {
        setTimeout(() => {
          resolve(undefined);
        }, 150);
      }),
    ]);
    expect(response?.statusCode).toBe(404);
  } finally {
    release.resolve(undefined);
    await lockTransaction;
    await lockDatabase.close();
  }
  const accepted = await accept(owner.headers);
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json()).toMatchObject({ status: "accepted", version: 2 });
  const cancel = (headers: typeof owner.headers) =>
    api.inject({
      url: url + "/cancel",
      method: "POST",
      headers: { ...headers, "idempotency-key": "fixture-cancel" },
      payload: { expectedVersion: 2, reason: "Fixture cancellation" },
    });
  expect((await cancel(customer.headers)).statusCode).toBe(409);
  expect((await cancel(owner.headers)).json()).toMatchObject({ status: "cancelled", version: 3 });
  const stream = await api.inject({
    url: "/v1/realtime?topic=merchantOrders&merchantId=" + merchantId + "&after=0",
    headers: owner.headers,
  });
  expect(stream.statusCode).toBe(200);
  expect(stream.body).toContain('"status":"accepted"');
  const foreignMerchantStream = await api.inject({
    url: "/v1/realtime?topic=merchantOrders&merchantId=" + merchantId + "&after=0",
    headers: outsider.headers,
  });
  expect(foreignMerchantStream.statusCode).toBe(404);
  expect(foreignMerchantStream.body).not.toContain(orderId);

  const customerStream = await api.inject({
    url: "/v1/realtime?topic=order&orderId=" + orderId + "&after=0",
    headers: customer.headers,
  });
  expect(customerStream.statusCode).toBe(200);
  expect(customerStream.body).toContain('"orderId":"' + orderId + '"');
  const foreignCustomerStream = await api.inject({
    url: "/v1/realtime?topic=order&orderId=" + orderId + "&after=0",
    headers: outsider.headers,
  });
  expect(foreignCustomerStream.statusCode).toBe(404);
  expect(foreignCustomerStream.body).not.toContain(orderId);

  const { sql } = database.get();
  const courier = await standardSession("+213500000004");
  const courierId = randomUUID();
  await sql`INSERT INTO public.couriers (id, user_id, merchant_id, created_at)
    VALUES (${courierId}, ${courier.userId}, ${merchantId}, ${now.toISOString()})`;
  for (const scenario of [
    {
      name: "reject",
      status: "pending_acceptance",
      fulfilment: "pickup",
      version: 1,
      shortCode: "BBB-333",
      payload: { reason: "closed" },
      allowed: owner,
      nextStatus: "rejected",
    },
    {
      name: "ready",
      status: "accepted",
      fulfilment: "pickup",
      version: 2,
      shortCode: "CCC-444",
      payload: {},
      allowed: owner,
      nextStatus: "ready",
    },
    {
      name: "collect",
      status: "ready",
      fulfilment: "pickup",
      version: 3,
      shortCode: "DDD-555",
      payload: {},
      allowed: owner,
      nextStatus: "collected",
    },
    {
      name: "assign",
      status: "accepted",
      fulfilment: "delivery",
      version: 2,
      shortCode: "EEE-666",
      payload: { courierId },
      allowed: owner,
      nextStatus: "accepted",
    },
    {
      name: "cancel",
      status: "pending_acceptance",
      fulfilment: "pickup",
      version: 1,
      shortCode: "FFF-777",
      payload: { reason: "Synthetic cancellation" },
      allowed: customer,
      nextStatus: "cancelled",
    },
  ]) {
    const targetOrderId = randomUUID();
    await sql`
      INSERT INTO public.orders (
        id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
        status, fulfilment, version, placed_at, last_event_at, acceptance_deadline_at,
        subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
      )
      SELECT ${targetOrderId}, ${randomUUID()}, customer_id, merchant_id, restaurant_name,
        ${scenario.shortCode}, order_day, ${scenario.status}::public.order_status,
        ${scenario.fulfilment}, ${scenario.version}, placed_at, last_event_at,
        ${new Date(now.getTime() + 60_000).toISOString()},
        subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
      FROM public.orders WHERE id = ${orderId}
    `;
    const before = await sql`
      SELECT status, version, courier_id, last_event_at FROM public.orders WHERE id = ${targetOrderId}
    `;
    const request = {
      method: "POST",
      url: `/v1/orders/${targetOrderId}/${scenario.name}`,
      payload: { expectedVersion: scenario.version, ...scenario.payload },
    } as const;
    const denied = await api.inject({
      ...request,
      headers: { ...outsider.headers, "idempotency-key": `foreign-${scenario.name}` },
    });
    expect(denied.statusCode, `foreign merchant ${scenario.name}`).toBe(404);
    expect(denied.json()).toMatchObject({ code: "not_found" });
    expect(denied.body).not.toContain(targetOrderId);
    expect(
      await sql`
        SELECT status, version, courier_id, last_event_at FROM public.orders WHERE id = ${targetOrderId}
      `,
    ).toEqual(before);
    expect(
      await sql`SELECT FROM public.order_events WHERE order_id = ${targetOrderId}`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT FROM public.order_action_receipts WHERE order_id = ${targetOrderId}`,
    ).toHaveLength(0);

    const allowed = await api.inject({
      ...request,
      headers: { ...scenario.allowed.headers, "idempotency-key": `allowed-${scenario.name}` },
    });
    expect(allowed.statusCode, `authorized ${scenario.name}`).toBe(200);
    expect(allowed.json()).toMatchObject({
      orderId: targetOrderId,
      status: scenario.nextStatus,
      version: scenario.version + 1,
    });
    expect(await sql`SELECT courier_id FROM public.orders WHERE id = ${targetOrderId}`).toEqual([
      { courier_id: scenario.name === "assign" ? courierId : null },
    ]);
    expect(
      await sql`SELECT FROM public.order_events WHERE order_id = ${targetOrderId}`,
    ).toHaveLength(1);
  }
});
