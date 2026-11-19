import { randomUUID } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { adminOrderDetailOutput, adminOrderSearchOutput } from "@zaafran/contracts/admin-orders";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[AUTH-05][AUTH-06][ADM-05] admin order reads require a live admin session", async () => {
  const [admin, revokedAdmin, customer] = await Promise.all([
    seedActor("+213500000001", "admin"),
    seedActor("+213500000002", "admin"),
    seedActor("+213500000003", "standard"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(customer.userId, "1710");
  const orderId = randomUUID();
  const shortCode = "AAA-222";
  const restaurantName = "Synthetic admin order";
  const { sql } = database.get();
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (${orderId}, ${randomUUID()}, ${customer.userId}, ${merchantId}, ${restaurantName},
      ${shortCode}, current_date, 'accepted', 'pickup', 2, ${now}, ${now},
      1000, 0, 1000, 1000, '[]'::jsonb)`;
  await sql`INSERT INTO public.order_events (
      order_id, version, from_status, to_status, actor_kind, actor_id, payload, occurred_at
    ) VALUES
      (${orderId}, 1, null, 'pending_acceptance', 'customer', ${customer.userId}, '{"kind":"place"}', ${now}),
      (${orderId}, 2, 'pending_acceptance', 'accepted', 'merchant', ${customer.userId},
        '{"kind":"accept","prepMinutes":15}', ${now})`;
  const beforeOrders =
    await sql`SELECT to_jsonb(purchase) AS data FROM public.orders AS purchase WHERE id = ${orderId}`;
  const beforeEvents = await sql`SELECT to_jsonb(event) AS data FROM public.order_events AS event
    WHERE order_id = ${orderId} ORDER BY version`;
  expect(beforeOrders).toHaveLength(1);
  expect(beforeEvents).toHaveLength(2);
  const api = await openApi();
  const searchRequest = {
    method: "POST",
    url: "/v1/admin/orders/search",
    payload: { scope: "all", filter: { kind: "code", code: shortCode } },
  } as const;
  const timelineRequest = { method: "GET", url: `/v1/admin/orders/${orderId}/timeline` } as const;

  for (const actor of [admin, revokedAdmin]) {
    const search = await api.inject({ ...searchRequest, headers: actor.headers });
    expect(search.statusCode).toBe(200);
    expect(search.headers["cache-control"]).toBe("no-store");
    const page = adminOrderSearchOutput.parse(search.json());
    expect(page.sessionId).toBe(actor.sessionId);
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]).toMatchObject({
      orderId,
      shortCode,
      restaurantName,
      status: "accepted",
    });
    const timeline = await api.inject({ ...timelineRequest, headers: actor.headers });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.headers["cache-control"]).toBe("no-store");
    const detail = adminOrderDetailOutput.parse(timeline.json());
    expect(detail.sessionId).toBe(actor.sessionId);
    expect(detail.order).toMatchObject({ orderId, shortCode, restaurantName });
    expect(detail.events).toMatchObject([
      { version: 1, from: null, to: "pending_acceptance", actor: "customer" },
      { version: 2, from: "pending_acceptance", to: "accepted", actor: "merchant" },
    ]);
  }
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  for (const actor of [
    { label: "guest", headers: {}, expected: 401 },
    { label: "standard", headers: customer.headers, expected: 403 },
    { label: "revoked admin", headers: revokedAdmin.headers, expected: 401 },
  ]) {
    for (const request of [searchRequest, timelineRequest]) {
      const denied = await api.inject({ ...request, headers: actor.headers });
      expect(denied.statusCode, `${actor.label} ${request.url}`).toBe(actor.expected);
      expect(denied.json()).toMatchObject({
        code: actor.expected === 401 ? "unauthenticated" : "forbidden",
      });
      for (const privateValue of [orderId, shortCode, restaurantName, customer.userId]) {
        expect(denied.body).not.toContain(privateValue);
      }
    }
  }
  expect(
    await sql`SELECT to_jsonb(purchase) AS data FROM public.orders AS purchase WHERE id = ${orderId}`,
  ).toEqual(beforeOrders);
  expect(
    await sql`SELECT to_jsonb(event) AS data FROM public.order_events AS event
    WHERE order_id = ${orderId} ORDER BY version`,
  ).toEqual(beforeEvents);
});

test("[ADM-05:security] order force requires an active admin and the current session", async () => {
  const [admin, revokedAdmin, customer] = await Promise.all([
    seedActor("+213500000011", "admin"),
    seedActor("+213500000012", "admin"),
    seedActor("+213500000013", "standard"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(customer.userId, "1711");
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const orderId = randomUUID();
  const { sql } = database.get();
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (${orderId}, ${randomUUID()}, ${customer.userId}, ${merchantId}, 'Private test',
      'AAA-333', current_date, 'accepted', 'pickup', 2, ${now}, ${now},
      1000, 0, 1000, 1000, '[]'::jsonb)`;
  await sql`INSERT INTO public.order_events (
      order_id, version, from_status, to_status, actor_kind, actor_id, payload, occurred_at
    ) VALUES
      (${orderId}, 1, null, 'pending_acceptance', 'customer', ${customer.userId}, '{"kind":"place"}', ${now}),
      (${orderId}, 2, 'pending_acceptance', 'accepted', 'merchant', ${customer.userId},
        '{"kind":"accept","prepMinutes":15}', ${now})`;
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  const beforeOrder = await sql`SELECT to_jsonb(purchase) AS data
    FROM public.orders AS purchase WHERE id = ${orderId}`;
  const beforeEvents = await sql`SELECT to_jsonb(event) AS data
    FROM public.order_events AS event WHERE order_id = ${orderId} ORDER BY version`;
  const api = await openApi();
  const request = {
    method: "POST",
    url: `/v1/orders/${orderId}/force`,
    headers: { "idempotency-key": randomUUID() },
    payload: { expectedVersion: 2, to: "cancelled", reason: "Customer support" },
  } as const;
  const denied = [
    {
      name: "guest",
      headers: { "x-expected-session-id": admin.sessionId },
      status: 401,
      code: "unauthenticated",
    },
    {
      name: "customer",
      headers: { ...customer.headers, "x-expected-session-id": customer.sessionId },
      status: 403,
      code: "forbidden",
    },
    {
      name: "revoked admin",
      headers: { ...revokedAdmin.headers, "x-expected-session-id": revokedAdmin.sessionId },
      status: 401,
      code: "unauthenticated",
    },
    {
      name: "stale admin session",
      headers: { ...admin.headers, "x-expected-session-id": customer.sessionId },
      status: 409,
      code: "session_changed",
    },
  ] as const;
  for (const actor of denied) {
    const response = await api.inject({
      ...request,
      headers: { ...request.headers, ...actor.headers },
    });
    expect(response.statusCode, actor.name).toBe(actor.status);
    expect(response.json(), actor.name).toMatchObject({ code: actor.code });
    expect(response.body).not.toContain("Private test");
  }
  expect(
    await sql`SELECT to_jsonb(purchase) AS data
    FROM public.orders AS purchase WHERE id = ${orderId}`,
  ).toEqual(beforeOrder);
  expect(
    await sql`SELECT to_jsonb(event) AS data
    FROM public.order_events AS event WHERE order_id = ${orderId} ORDER BY version`,
  ).toEqual(beforeEvents);
  expect(await sql`SELECT * FROM public.audit_log WHERE order_id = ${orderId}`).toHaveLength(0);
  expect(
    await sql`SELECT * FROM public.order_action_receipts WHERE order_id = ${orderId}`,
  ).toHaveLength(0);

  const applied = await api.inject({
    ...request,
    headers: { ...request.headers, ...admin.headers, "x-expected-session-id": admin.sessionId },
  });
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toMatchObject({ orderId, status: "cancelled", version: 3 });
  expect(
    await sql`SELECT actor_id, action, reason FROM public.audit_log WHERE order_id = ${orderId}`,
  ).toEqual([
    { actor_id: admin.userId, action: "order_force_cancelled", reason: "Customer support" },
  ]);
});
