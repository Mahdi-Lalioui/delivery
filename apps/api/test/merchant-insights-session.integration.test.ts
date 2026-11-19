import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-19T12:00:00.000Z").toISOString();
const { openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
const dateRange = "?from=2026-11-18&to=2026-11-19";

test("[MER-20][MER-21][AUTH-07] real sessions cannot read another restaurant's insights", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000081", "standard"),
    seedActor("+213500000082", "standard"),
    seedActor("+213500000083", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1701"),
    seedMenuMerchants(ownerB.userId, "1702"),
  ]);
  const api = await openApi();

  for (const route of ["analytics" as const, "reviews" as const]) {
    const query = route === "analytics" ? dateRange : "?stars=4";
    const own = await api.inject({
      url: `/v1/merchants/${restaurantA.owned}/${route}${query}`,
      headers: ownerA.headers,
    });
    expect(own.statusCode).toBe(200);

    for (const actor of [ownerB, customer]) {
      const foreign = await api.inject({
        url: `/v1/merchants/${restaurantA.owned}/${route}${query}`,
        headers: actor.headers,
      });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.body).not.toContain(restaurantA.owned);
    }

    const otherRestaurant = await api.inject({
      url: `/v1/merchants/${restaurantB.owned}/${route}${query}`,
      headers: ownerA.headers,
    });
    expect(otherRestaurant.statusCode).toBe(404);
    expect(otherRestaurant.body).not.toContain(restaurantB.owned);
  }
});
