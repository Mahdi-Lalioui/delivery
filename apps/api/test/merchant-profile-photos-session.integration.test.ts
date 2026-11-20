import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-19T12:00:00.000Z").toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[MER-14][AUTH-07] real sessions cannot read or replace another restaurant's profile photos", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000101", "standard"),
    seedActor("+213500000102", "standard"),
    seedActor("+213500000103", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1707"),
    seedMenuMerchants(ownerB.userId, "1708"),
  ]);
  const api = await openApi();
  const photosPath = (merchantId: string) => `/v1/merchants/${merchantId}/profile/photos`;

  expect(
    (await api.inject({ url: photosPath(restaurantA.owned), headers: ownerA.headers })).statusCode,
  ).toBe(200);

  for (const [actor, merchantId] of [
    [ownerB, restaurantA.owned],
    [customer, restaurantA.owned],
    [ownerA, restaurantB.owned],
  ] as const) {
    const path = photosPath(merchantId);
    const read = await api.inject({ url: path, headers: actor.headers });
    expect(read.statusCode).toBe(404);
    expect(read.body).not.toContain(merchantId);

    const write = await api.inject({
      method: "PUT",
      url: path,
      headers: {
        ...actor.headers,
        "idempotency-key": `profile-${actor.sessionId}`,
        "x-expected-session-id": actor.sessionId,
      },
      payload: { coverPhotoId: null, logoPhotoId: null, expectedRevision: 0 },
    });
    expect(write.statusCode).toBe(404);
    expect(write.body).not.toContain(merchantId);
  }

  expect(
    await database.get().sql`
      SELECT id, cover_photo_id AS "coverPhotoId", logo_photo_id AS "logoPhotoId"
      FROM public.merchants WHERE id IN (${restaurantA.owned}, ${restaurantB.owned})
      ORDER BY id
    `,
  ).toEqual(
    [restaurantA.owned, restaurantB.owned]
      .sort()
      .map((id) => ({ id, coverPhotoId: null, logoPhotoId: null })),
  );
  expect(
    await database.get().sql`
      SELECT FROM public.menu_command_receipts
      WHERE merchant_id IN (${restaurantA.owned}, ${restaurantB.owned})
    `,
  ).toHaveLength(0);
});
