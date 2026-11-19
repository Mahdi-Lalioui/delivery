import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-19T12:00:00.000Z").toISOString();
const { openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
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
