import { randomUUID } from "node:crypto";
import { adminDashboardTodayOutput } from "@zaafran/contracts/retention";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
const url = "/v1/admin/dashboard/today";

test("[AUTH-05][AUTH-06][ADM-02] only live admin sessions can read the private daily dashboard", async () => {
  const [admin, revokedAdmin, customer] = await Promise.all([
    seedActor("+213500000001", "admin"),
    seedActor("+213500000002", "admin"),
    seedActor("+213500000003", "standard"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(customer.userId);
  const orderId = randomUUID();
  const { sql } = database.get();
  await sql`INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (${orderId}, ${randomUUID()}, ${customer.userId}, ${merchantId},
      'Synthetic dashboard order', 'AAA-222',
      (${now}::timestamptz AT TIME ZONE 'Africa/Algiers')::date,
      'collected', 'pickup', 4, ${now}, ${now}, 4321, 0, 4321, 4321, '[]'::jsonb)`;
  const beforeOrders =
    await sql`SELECT to_jsonb(purchase) AS data FROM public.orders AS purchase WHERE id = ${orderId}`;
  expect(beforeOrders).toHaveLength(1);
  const api = await openApi();

  for (const actor of [admin, revokedAdmin]) {
    const dashboard = await api.inject({ url, headers: actor.headers });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.headers["cache-control"]).toBe("no-store");
    expect(adminDashboardTodayOutput.parse(dashboard.json())).toMatchObject({
      totals: { orders: 1, salesDzd: 4321, averageTicketDzd: 4321 },
      cancellations: [],
      unresponsiveRestaurants: 0,
      errorRate: 0,
      jobBacklog: 0,
    });
  }
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  for (const actor of [
    { label: "guest", headers: {}, expected: 401 },
    { label: "standard", headers: customer.headers, expected: 403 },
    { label: "revoked admin", headers: revokedAdmin.headers, expected: 401 },
  ]) {
    const denied = await api.inject({ url, headers: actor.headers });
    expect(denied.statusCode, actor.label).toBe(actor.expected);
    expect(denied.json()).toMatchObject({
      code: actor.expected === 401 ? "unauthenticated" : "forbidden",
    });
    for (const field of [
      "totals",
      "cancellations",
      "unresponsiveRestaurants",
      "errorRate",
      "jobBacklog",
    ]) {
      expect(denied.json()).not.toHaveProperty(field);
    }
    expect(denied.body).not.toContain(orderId);
    expect(denied.body).not.toContain(customer.userId);
  }
  expect(
    await sql`SELECT to_jsonb(purchase) AS data FROM public.orders AS purchase WHERE id = ${orderId}`,
  ).toEqual(beforeOrders);
});
