import { randomUUIDv7 } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

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
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
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
