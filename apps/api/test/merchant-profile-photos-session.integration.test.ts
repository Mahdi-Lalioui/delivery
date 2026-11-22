import { randomUUIDv7 } from "node:crypto";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { expect, test } from "vitest";
import { seedReadyPhoto } from "../../../packages/db/test/ready-photo.ts";
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

async function seedMenuPhotos(accountId: string, merchantId: string) {
  const { sql } = database.get();
  const coverId = randomUUIDv7();
  const photoId = randomUUIDv7();
  const categoryId = randomUUIDv7();
  const itemId = randomUUIDv7();
  for (const [mediaId, kind] of [
    [coverId, "cover"],
    [photoId, "item"],
  ] as const) {
    await seedReadyPhoto(sql, { mediaId, accountId, merchantId, kind, now: new Date(now) });
  }
  await sql`UPDATE public.merchants SET cover_photo_id = ${coverId} WHERE id = ${merchantId}`;
  await sql`INSERT INTO public.categories (id, merchant_id, names, sort)
    VALUES (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0)`;
  await sql`INSERT INTO public.items (id, category_id, merchant_id, photo_id, names, descriptions,
    price_dzd, tags, prep_extra_min)
    VALUES (${itemId}, ${categoryId}, ${merchantId}, ${photoId}, '{"fr":"Plat fictif"}',
      '{"fr":"Description fictive"}', 1000, ARRAY[]::text[], 0)`;
  return { merchantId, categoryId, itemId, photoId, coverId };
}

test("[MER-14][AUTH-07] a shared owner cannot move ready photos between restaurants", async () => {
  const owner = await seedActor("+213500000158", "standard");
  const [restaurant, otherRestaurant] = await Promise.all([
    seedMenuMerchants(owner.userId, "1620"),
    seedMenuMerchants(owner.userId, "1621"),
  ]);
  const menu = await seedMenuPhotos(owner.userId, restaurant.owned);
  const otherMenu = await seedMenuPhotos(owner.userId, otherRestaurant.owned);
  const { sql } = database.get();
  const replacement = randomUUIDv7();
  await seedReadyPhoto(sql, {
    mediaId: replacement,
    accountId: owner.userId,
    merchantId: menu.merchantId,
    kind: "item",
    now: new Date(now),
  });
  const api = await openApi();
  const base = `/v1/merchants/${menu.merchantId}`;
  const commandHeaders = () => ({
    ...owner.headers,
    "x-expected-session-id": owner.sessionId,
    "idempotency-key": randomUUIDv7(),
  });
  const details = {
    categoryId: menu.categoryId,
    names: { fr: "Plat de démonstration" },
    descriptions: { fr: "Description fictive" },
    priceDzd: 1000,
    tags: [],
    extraPrepMinutes: 0,
    optionGroupIds: [],
    expectedRevision: 0,
  };
  const deniedCreate = await api.inject({
    method: "POST",
    url: base + "/menu/items",
    headers: commandHeaders(),
    payload: { ...details, photoId: otherMenu.photoId },
  });
  const editItem = (photoId: string) =>
    api.inject({
      method: "PUT",
      url: `${base}/menu/items/${menu.itemId}`,
      headers: commandHeaders(),
      payload: { ...details, photoId },
    });
  const deniedEdit = await editItem(otherMenu.photoId);
  const deniedProfile = await api.inject({
    method: "PUT",
    url: base + "/profile/photos",
    headers: commandHeaders(),
    payload: { coverPhotoId: otherMenu.coverId, logoPhotoId: null, expectedRevision: 0 },
  });
  for (const denied of [deniedCreate, deniedEdit, deniedProfile]) {
    expect(denied.statusCode).toBe(409);
    expect(problemResponseSchema.parse(denied.json()).code).toBe("photos_unavailable");
    expect(denied.body).not.toContain(otherMenu.photoId);
    expect(denied.body).not.toContain(otherMenu.coverId);
  }

  const merchantIds = [menu.merchantId, otherMenu.merchantId];
  expect(
    await sql`SELECT photo_id FROM public.items WHERE merchant_id = ANY(${merchantIds}::uuid[])
    ORDER BY photo_id`,
  ).toEqual([menu.photoId, otherMenu.photoId].sort().map((photo_id) => ({ photo_id })));
  expect(
    await sql`SELECT menu_revision, cover_photo_id FROM public.merchants
    WHERE id = ANY(${merchantIds}::uuid[]) ORDER BY cover_photo_id`,
  ).toEqual(
    [menu.coverId, otherMenu.coverId]
      .sort()
      .map((cover_photo_id) => ({ menu_revision: "0", cover_photo_id })),
  );
  expect(
    await sql`SELECT FROM public.menu_command_receipts
    WHERE merchant_id = ANY(${merchantIds}::uuid[])`,
  ).toEqual([]);

  const updated = await editItem(replacement);
  expect(updated.statusCode).toBe(200);
  expect(updated.json()).toMatchObject({ revision: 1, item: { photoId: replacement } });

  const newCover = randomUUIDv7();
  await seedReadyPhoto(sql, {
    mediaId: newCover,
    accountId: owner.userId,
    merchantId: menu.merchantId,
    kind: "cover",
    now: new Date(now),
  });
  const profile = await api.inject({
    method: "PUT",
    url: base + "/profile/photos",
    headers: commandHeaders(),
    payload: { coverPhotoId: newCover, logoPhotoId: null, expectedRevision: 1 },
  });
  expect(profile.statusCode).toBe(200);
  expect(profile.json()).toMatchObject({ coverPhotoId: newCover, revision: 2 });
  expect(
    await sql`SELECT cover_photo_id FROM public.merchants WHERE id = ${otherMenu.merchantId}`,
  ).toEqual([{ cover_photo_id: otherMenu.coverId }]);
});
