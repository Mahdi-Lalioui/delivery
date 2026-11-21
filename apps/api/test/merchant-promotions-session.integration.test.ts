import { merchantPromotionListOutput } from "@zaafran/contracts/promotions";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
const promotion = {
  activation: { kind: "code" as const, code: "ALGERDAY" },
  discount: { kind: "fixed" as const, amountDzd: 100 },
  conditions: { minimumSubtotalDzd: 500 },
};

test("[MER-19][AUTH-07] real sessions cannot read or change another restaurant's promotions", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000061", "standard"),
    seedActor("+213500000062", "standard"),
    seedActor("+213500000063", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1696"),
    seedMenuMerchants(ownerB.userId, "1697"),
  ]);
  const api = await openApi();
  const path = `/v1/merchants/${restaurantA.owned}/promotions`;
  const commandHeaders = (actor: typeof ownerA, key: string) => ({
    ...actor.headers,
    "idempotency-key": key,
    "x-expected-session-id": actor.sessionId,
  });
  const created = await api.inject({
    method: "POST",
    url: path,
    headers: commandHeaders(ownerA, "owner-create"),
    payload: promotion,
  });
  expect(created.statusCode).toBe(201);
  const promotionId = created.json<{ promotionId: string }>().promotionId;

  for (const actor of [ownerB, customer]) {
    const list = await api.inject({ url: path, headers: actor.headers });
    expect(list.statusCode).toBe(404);
    expect(list.body).not.toContain(promotionId);
    const foreignCreate = await api.inject({
      method: "POST",
      url: path,
      headers: commandHeaders(actor, "foreign-create"),
      payload: { ...promotion, activation: { kind: "code", code: "FOREIGN" } },
    });
    const foreignUpdate = await api.inject({
      method: "PUT",
      url: `${path}/${promotionId}`,
      headers: commandHeaders(actor, "foreign-update"),
      payload: { ...promotion, activation: { kind: "code", code: "CHANGED" } },
    });
    for (const response of [foreignCreate, foreignUpdate]) {
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain(promotionId);
    }
  }

  const ownList = await api.inject({ url: path, headers: ownerA.headers });
  expect(merchantPromotionListOutput.parse(ownList.json()).promotions).toHaveLength(1);
  const foreignRestaurantPath = `/v1/merchants/${restaurantB.owned}/promotions`;
  expect(
    (await api.inject({ url: foreignRestaurantPath, headers: ownerA.headers })).statusCode,
  ).toBe(404);
  const wrongResource = await api.inject({
    method: "PUT",
    url: `${foreignRestaurantPath}/${promotionId}`,
    headers: commandHeaders(ownerB, "foreign-resource-update"),
    payload: { ...promotion, activation: { kind: "code", code: "CHANGED" } },
  });
  expect(wrongResource.statusCode).toBe(404);
  expect(wrongResource.body).not.toContain(promotionId);
  expect(
    await database.get().sql`SELECT id, merchant_id, code FROM public.promotions`,
  ).toMatchObject([{ id: promotionId, merchant_id: restaurantA.owned, code: "ALGERDAY" }]);
  expect(await database.get().sql`SELECT FROM public.promotion_command_receipts`).toHaveLength(1);
});
