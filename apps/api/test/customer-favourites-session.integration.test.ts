import { customerFavouritesOutput } from "@zaafran/contracts/retention";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[CUS-23][AUTH-07] real customer sessions keep favourite lists and writes account-scoped", async () => {
  const [customerA, customerB] = await Promise.all([
    seedActor("+213500000051", "standard"),
    seedActor("+213500000052", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(customerA.userId, "1698"),
    seedMenuMerchants(customerB.userId, "1699"),
  ]);
  await database.get().sql`
    UPDATE public.merchants SET status = 'active'
    WHERE id = ANY(${[restaurantA.owned, restaurantB.owned]}::uuid[])
  `;
  const api = await openApi();
  const setFavourite = (
    headers: typeof customerA.headers,
    merchantId: string,
    method: "PUT" | "DELETE",
  ) => api.inject({ method, url: `/v1/me/favourites/${merchantId}`, headers });

  for (const [customer, restaurant] of [
    [customerA, restaurantA],
    [customerB, restaurantB],
  ] as const) {
    expect((await setFavourite(customer.headers, restaurant.owned, "PUT")).statusCode).toBe(200);
  }

  for (const [customer, own, foreign] of [
    [customerA, restaurantA.owned, restaurantB.owned],
    [customerB, restaurantB.owned, restaurantA.owned],
  ] as const) {
    const response = await api.inject({ url: "/v1/me/favourites", headers: customer.headers });
    const result = customerFavouritesOutput.parse(response.json());
    expect(response.statusCode).toBe(200);
    expect(result.restaurants.map(({ merchantId }) => merchantId)).toEqual([own]);
    expect(response.body).not.toContain(foreign);
  }

  // A customer may change only their own relation, even when the restaurant is public.
  expect((await setFavourite(customerA.headers, restaurantB.owned, "DELETE")).statusCode).toBe(200);
  const stillPrivate = await api.inject({ url: "/v1/me/favourites", headers: customerB.headers });
  expect(
    customerFavouritesOutput
      .parse(stillPrivate.json())
      .restaurants.map(({ merchantId }) => merchantId),
  ).toEqual([restaurantB.owned]);
  const persisted = await database.get().sql`
      SELECT customer_id, merchant_id FROM public.customer_favourites
      WHERE merchant_id = ANY(${[restaurantA.owned, restaurantB.owned]}::uuid[])
      ORDER BY customer_id, merchant_id
    `;
  expect(persisted).toHaveLength(2);
  expect(persisted).toEqual(
    expect.arrayContaining([
      { customer_id: customerA.userId, merchant_id: restaurantA.owned },
      { customer_id: customerB.userId, merchant_id: restaurantB.owned },
    ]),
  );
});
