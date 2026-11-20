import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-19T12:00:00.000Z").toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
const readRoutes = [
  "/hours",
  "/hours/ramadan",
  "/hours/pause",
  "/hours/preview?schedule=regular",
  "/delivery-settings",
];

test("[MER-08][HRS-03][AUTH-07] real sessions cannot read another restaurant's settings", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000091", "standard"),
    seedActor("+213500000092", "standard"),
    seedActor("+213500000093", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1703"),
    seedMenuMerchants(ownerB.userId, "1704"),
  ]);
  const api = await openApi();

  for (const route of readRoutes) {
    const own = await api.inject({
      url: `/v1/merchants/${restaurantA.owned}${route}`,
      headers: ownerA.headers,
    });
    expect(own.statusCode).toBe(200);

    for (const actor of [ownerB, customer]) {
      const foreign = await api.inject({
        url: `/v1/merchants/${restaurantA.owned}${route}`,
        headers: actor.headers,
      });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.body).not.toContain(restaurantA.owned);
    }

    const otherRestaurant = await api.inject({
      url: `/v1/merchants/${restaurantB.owned}${route}`,
      headers: ownerA.headers,
    });
    expect(otherRestaurant.statusCode).toBe(404);
    expect(otherRestaurant.body).not.toContain(restaurantB.owned);
  }
});

test("[MER-15][MER-16][MER-17][AUTH-07] foreign settings writes leave schedules and receipts unchanged", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000094", "standard"),
    seedActor("+213500000095", "standard"),
    seedActor("+213500000096", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1705"),
    seedMenuMerchants(ownerB.userId, "1706"),
  ]);
  const api = await openApi();
  const weekly = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    ranges: [{ opensMinute: 600, closesMinute: 1200 }],
  }));
  const inputs = [
    {
      path: "/hours",
      method: "PUT" as const,
      payload: { weekly, specialDates: [], expectedRevision: 1 },
    },
    {
      path: "/hours/ramadan",
      method: "PUT" as const,
      payload: {
        weekly: weekly.map(({ weekday }) => ({ weekday, ranges: [] })),
        suhoor: null,
        method: "Algeria",
        adjustmentMinutes: 0,
        expectedRevision: 1,
      },
    },
    {
      path: "/hours/pause",
      method: "PUT" as const,
      payload: { pausedUntil: null, expectedRevision: 1 },
    },
    {
      path: "/delivery-settings",
      method: "PUT" as const,
      payload: {
        pickupEnabled: true,
        deliveryEnabled: true,
        pickupMinimumDzd: 0,
        prepMinutes: 20,
        zone: { radiusMeters: 4000, feeDzd: 200, minimumDzd: 500, travelMinutes: 15 },
        expectedRevision: 1,
      },
    },
  ];

  for (const [inputIndex, input] of inputs.entries()) {
    for (const [actor, merchantId] of [
      [ownerB, restaurantA.owned],
      [customer, restaurantA.owned],
      [ownerA, restaurantB.owned],
    ] as const) {
      const response = await api.inject({
        method: input.method,
        url: `/v1/merchants/${merchantId}${input.path}`,
        headers: {
          ...actor.headers,
          "idempotency-key": `settings-${String(inputIndex)}-${actor.sessionId}`,
          "x-expected-session-id": actor.sessionId,
        },
        payload: input.payload,
      });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain(merchantId);
    }
  }

  expect(
    await database.get().sql`
      SELECT
        (SELECT count(*)::int FROM public.merchant_hours WHERE merchant_id IN (${restaurantA.owned}, ${restaurantB.owned})) AS hours,
        (SELECT count(*)::int FROM public.merchant_ramadan_schedules WHERE merchant_id IN (${restaurantA.owned}, ${restaurantB.owned})) AS ramadan,
        (SELECT count(*)::int FROM public.merchant_order_settings WHERE merchant_id IN (${restaurantA.owned}, ${restaurantB.owned})) AS delivery,
        (SELECT count(*)::int FROM public.menu_command_receipts WHERE merchant_id IN (${restaurantA.owned}, ${restaurantB.owned})) AS receipts
    `,
  ).toEqual([{ hours: 0, ramadan: 0, delivery: 0, receipts: 0 }]);
});
