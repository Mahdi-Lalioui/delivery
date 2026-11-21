import { randomUUIDv7 } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { beforeAll, expect, test } from "vitest";
import { createSessionToken } from "../src/auth-crypto.ts";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

beforeAll(async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
});

async function openStream(url: URL, headers: Record<string, string>, signal: AbortSignal) {
  const response = await fetch(url, { headers, signal });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  if (!response.body) throw new Error("Expected an open event stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  return async (marker?: string) => {
    let body = "";
    let chunk = await reader.read();
    while (!chunk.done) {
      body += decoder.decode(chunk.value, { stream: true });
      if (marker !== undefined && body.includes(marker)) return body;
      chunk = await reader.read();
    }
    return body + decoder.decode();
  };
}

async function seedPendingOrder(merchantId: string, customerId: string) {
  const orderId = randomUUIDv7();
  await database.get().sql`
    INSERT INTO public.orders (id, quote_id, customer_id, merchant_id, restaurant_name, short_code,
      order_day, status, fulfilment, version, placed_at, last_event_at, acceptance_deadline_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines)
    VALUES (${orderId}, ${randomUUIDv7()}, ${customerId}, ${merchantId}, 'Restaurant fictif',
      'BBB-234', current_date, 'pending_acceptance', 'pickup', 1, ${now}, ${now},
      ${now}::timestamptz + interval '3 minutes', 1000, 0, 1000, 1000, '[]')
  `;
  return orderId;
}

test("[RT-02][AUTH-07] live merchant streams close after session or membership loss", async () => {
  const [owner, revokedSession, revokedMember, customer] = await Promise.all([
    seedActor("+213500000191", "standard"),
    seedActor("+213500000192", "standard"),
    seedActor("+213500000193", "standard"),
    seedActor("+213500000194", "standard"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(owner.userId, "1624");
  const { sql } = database.get();
  await sql`INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${revokedSession.userId}, 'manager'),
      (${merchantId}, ${revokedMember.userId}, 'manager')`;
  const orderId = await seedPendingOrder(merchantId, customer.userId);
  const api = await openApi();
  const origin = await api.listen({ port: 0, host: "127.0.0.1" });
  const streamUrl = new URL(
    `/v1/realtime?topic=merchantOrders&merchantId=${merchantId}&after=0`,
    origin,
  );
  const shutdown = new AbortController();
  const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(7_000)]);
  const command = (action: "accept" | "cancel", payload: object) =>
    api.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/${action}`,
      headers: { ...owner.headers, "idempotency-key": randomUUIDv7() },
      payload,
    });

  try {
    const [stayOpen, endSession, endMembership] = await Promise.all([
      openStream(streamUrl, owner.headers, signal),
      openStream(streamUrl, revokedSession.headers, signal),
      openStream(streamUrl, revokedMember.headers, signal),
    ]);
    expect((await command("accept", { expectedVersion: 1, prepMinutes: 15 })).statusCode).toBe(200);
    const firstEvent = await Promise.all([
      stayOpen('"status":"accepted"'),
      endSession('"status":"accepted"'),
      endMembership('"status":"accepted"'),
    ]);
    for (const data of firstEvent) {
      expect(data).toContain('"status":"accepted"');
      expect(data).toContain(orderId);
    }

    const logout = await api.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { ...revokedSession.headers, "idempotency-key": randomUUIDv7() },
      payload: { scope: "current", expectedSessionId: revokedSession.sessionId },
    });
    expect(logout.statusCode).toBe(204);
    expect(
      (
        await sql`DELETE FROM public.merchant_members
      WHERE merchant_id = ${merchantId} AND user_id = ${revokedMember.userId}`
      ).count,
    ).toBe(1);
    expect(
      (await command("cancel", { expectedVersion: 2, reason: "Synthetic cancellation" }))
        .statusCode,
    ).toBe(200);

    const [survivor, closedSession, closedMembership] = await Promise.all([
      stayOpen('"status":"cancelled"'),
      endSession(),
      endMembership(),
    ]);
    expect(survivor).toContain('"status":"cancelled"');
    expect(survivor).toContain(orderId);
    for (const closed of [closedSession, closedMembership]) {
      expect(closed).not.toContain('"status":"cancelled"');
      expect(closed).not.toContain(orderId);
    }
    const reconnect = (headers: Record<string, string>) => fetch(streamUrl, { headers, signal });
    expect((await reconnect(revokedSession.headers)).status).toBe(401);
    expect((await reconnect(revokedMember.headers)).status).toBe(404);
  } finally {
    shutdown.abort();
  }
}, 12_000);

async function seedActiveDelivery(input: {
  merchantId: string;
  customerId: string;
  driverId: string;
}) {
  const { sql } = database.get();
  const courierId = randomUUIDv7();
  const orderId = randomUUIDv7();
  await sql`INSERT INTO public.couriers (id, user_id, merchant_id, created_at)
    VALUES (${courierId}, ${input.driverId}, ${input.merchantId}, ${now})`;
  await sql`
    INSERT INTO public.orders (id, quote_id, customer_id, merchant_id, restaurant_name, short_code,
      order_day, status, fulfilment, version, placed_at, last_event_at, courier_id, address_snapshot,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines)
    VALUES (${orderId}, ${randomUUIDv7()}, ${input.customerId}, ${input.merchantId}, 'Restaurant fictif',
      'BBB-345', current_date, 'out_for_delivery', 'delivery', 5, ${now}, ${now}, ${courierId},
      '{"pin":{"latitude":36.75,"longitude":3.06}}', 1000, 100, 1100, 1100, '[]')
  `;
  return orderId;
}

async function secondSessionHeaders(actor: Awaited<ReturnType<typeof seedActor>>) {
  const { token, tokenHash } = createSessionToken();
  await database.get().sql`
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    SELECT ${randomUUIDv7()}, user_id, ${tokenHash}, transport, kind, request_ip, created_at,
      last_seen_at, expires_at FROM public.sessions WHERE id = ${actor.sessionId}
  `;
  return { ...actor.headers, cookie: "__Host-session=" + token };
}

test("[RT-02][CUS-18][AUTH-07] an open customer stream stops before the next delivery update after logout", async () => {
  const [owner, customer, driver, admin] = await Promise.all([
    seedActor("+213500000195", "standard"),
    seedActor("+213500000196", "standard"),
    seedActor("+213500000197", "standard"),
    seedActor("+213500000198", "admin"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(owner.userId, "1625");
  const orderId = await seedActiveDelivery({
    merchantId,
    customerId: customer.userId,
    driverId: driver.userId,
  });
  const otherDevice = await secondSessionHeaders(customer);
  let clock = new Date(now);
  const api = await openApi(() => clock);
  const origin = await api.listen({ port: 0, host: "127.0.0.1" });
  const streamUrl = new URL(`/v1/realtime?topic=order&orderId=${orderId}&after=0`, origin);
  const shutdown = new AbortController();
  const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(7_000)]);
  const sendPosition = (latitude: number) =>
    api.inject({
      method: "POST",
      url: "/v1/courier/positions",
      headers: driver.headers,
      payload: {
        orderId,
        positions: [{ latitude, longitude: 3.06, accuracyM: 8, capturedAt: clock.toISOString() }],
      },
    });

  try {
    const [endSession, stayOpen] = await Promise.all([
      openStream(streamUrl, customer.headers, signal),
      openStream(streamUrl, otherDevice, signal),
    ]);
    const firstPosition = await sendPosition(36.75);
    expect(firstPosition.statusCode).toBe(200);
    expect(firstPosition.json()).toEqual({ accepted: 1 });
    const firstPoint = `"capturedAt":"${clock.toISOString()}"`;
    for (const event of await Promise.all([endSession(firstPoint), stayOpen(firstPoint)])) {
      expect(event).toContain("event: position");
      expect(event).toContain(firstPoint);
      expect(event).toContain(orderId);
    }

    const logout = await api.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { ...customer.headers, "idempotency-key": randomUUIDv7() },
      payload: { scope: "current", expectedSessionId: customer.sessionId },
    });
    expect(logout.statusCode).toBe(204);
    clock = new Date(clock.getTime() + 6_000);
    const nextPosition = await sendPosition(36.75025);
    expect(nextPosition.statusCode).toBe(200);
    expect(nextPosition.json()).toEqual({ accepted: 1 });
    const nextPoint = `"capturedAt":"${clock.toISOString()}"`;
    const [closed, active] = await Promise.all([endSession(), stayOpen(nextPoint)]);
    expect(active).toContain(nextPoint);
    expect(closed).not.toContain("event: position");
    expect(closed).not.toContain(nextPoint);
    expect(closed).not.toContain(orderId);

    const cancelled = await api.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/force`,
      headers: {
        ...admin.headers,
        "idempotency-key": randomUUIDv7(),
        "x-expected-session-id": admin.sessionId,
      },
      payload: { expectedVersion: 5, to: "cancelled", reason: "Synthetic cancellation" },
    });
    expect(cancelled.statusCode).toBe(200);
    const lastEvent = await stayOpen('"status":"cancelled"');
    expect(lastEvent).toContain('"status":"cancelled"');
    expect(lastEvent).toContain(orderId);
    expect((await fetch(streamUrl, { headers: customer.headers, signal })).status).toBe(401);
  } finally {
    shutdown.abort();
  }
}, 12_000);
