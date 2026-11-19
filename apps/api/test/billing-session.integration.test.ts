import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-19T12:00:00.000Z").toISOString();
const { openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[BIL-02][AUTH-07] billing read routes conceal another restaurant from real sessions", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000071", "standard"),
    seedActor("+213500000072", "standard"),
    seedActor("+213500000073", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1698"),
    seedMenuMerchants(ownerB.userId, "1699"),
  ]);
  const api = await openApi();

  for (const route of ["billing", "invoices"]) {
    const own = await api.inject({
      url: `/v1/merchants/${restaurantA.owned}/${route}`,
      headers: ownerA.headers,
    });
    expect(own.statusCode).toBe(200);

    for (const actor of [ownerB, customer]) {
      const foreign = await api.inject({
        url: `/v1/merchants/${restaurantA.owned}/${route}`,
        headers: actor.headers,
      });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.body).not.toContain(restaurantA.owned);
    }

    const otherRestaurant = await api.inject({
      url: `/v1/merchants/${restaurantB.owned}/${route}`,
      headers: ownerA.headers,
    });
    expect(otherRestaurant.statusCode).toBe(404);
    expect(otherRestaurant.body).not.toContain(restaurantB.owned);
  }
});
