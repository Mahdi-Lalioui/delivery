import { createHash, randomUUIDv7 } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { mediaOutput } from "@zaafran/contracts/media";
import {
  publicRestaurantItemOutput,
  publicRestaurantItemsOutput,
} from "@zaafran/contracts/restaurant";
import { createLocalMediaStore, type MediaStore } from "@zaafran/media";
import { runMigrations } from "graphile-worker";
import { expect, onTestFinished, test } from "vitest";
import { seedReadyPhoto } from "../../../packages/db/test/ready-photo.ts";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-21T12:00:00.000Z");
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(
  now.toISOString(),
);

async function openObservedMediaApi() {
  const mediaRoot = await mkdtemp(join(tmpdir(), "awid-media-isolation-"));
  onTestFinished(() => rm(mediaRoot, { recursive: true, force: true }));
  const disk = createLocalMediaStore({ root: mediaRoot });
  const reads: string[] = [];
  const store: MediaStore = {
    put: (input) => disk.put(input),
    get(key) {
      reads.push(key);
      return disk.get(key);
    },
    delete: (key) => disk.delete(key),
  };
  const api = await openApi(undefined, { mediaStore: store }, mediaRoot);
  return {
    api,
    reads,
    storeVariant: async (mediaId: string) => {
      const key = `variants/${mediaId}/640.webp`;
      const bytes = Buffer.from(mediaId.slice(-16));
      await disk.put({
        key,
        body: Readable.from([bytes]),
        bytes: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("base64"),
      });
      return { key, bytes };
    },
  };
}

async function seedMenu(ownerId: string, merchantId: string, status: "active" | "approved") {
  const { sql } = database.get();
  const categoryId = randomUUIDv7();
  const itemId = randomUUIDv7();
  const photoId = randomUUIDv7();
  const coverId = randomUUIDv7();
  await seedReadyPhoto(sql, {
    mediaId: photoId,
    accountId: ownerId,
    merchantId,
    kind: "item",
    now,
  });
  await seedReadyPhoto(sql, {
    mediaId: coverId,
    accountId: ownerId,
    merchantId,
    kind: "cover",
    now,
  });
  await sql`
    UPDATE public.merchants SET status = ${status}, cover_photo_id = ${coverId}
    WHERE id = ${merchantId}
  `;
  await sql`
    INSERT INTO public.categories (id, merchant_id, names, sort)
    VALUES (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0)
  `;
  await sql`
    INSERT INTO public.items (id, merchant_id, category_id, photo_id, names, descriptions, price_dzd,
      tags, prep_extra_min, moderation_status)
    VALUES (${itemId}, ${merchantId}, ${categoryId}, ${photoId}, '{"fr":"Plat fictif"}',
      '{"fr":"Description fictive"}', 1000, ARRAY[]::text[], 0, 'approved')
  `;
  return { merchantId, slug: `restaurant-${merchantId}`, categoryId, itemId, photoId, coverId };
}

function profileVariant(merchantId: string, mediaId: string) {
  return `/v1/merchants/${merchantId}/profile/photos/${mediaId}/variants/webp/640`;
}

function itemVariant(merchantId: string, itemId: string, mediaId: string) {
  return `/v1/merchants/${merchantId}/items/${itemId}/photos/${mediaId}/variants/webp/640`;
}

test("[CUS-04][CUS-07][CUS-08] public menus and variants resolve resources within the addressed restaurant", async () => {
  const [owner, otherOwner] = await Promise.all([
    seedActor("+213500000151", "standard"),
    seedActor("+213500000152", "standard"),
  ]);
  const [restaurant, otherRestaurant] = await Promise.all([
    seedMenuMerchants(owner.userId, "1614"),
    seedMenuMerchants(otherOwner.userId, "1615"),
  ]);
  const menu = await seedMenu(owner.userId, restaurant.owned, "active");
  const otherMenu = await seedMenu(otherOwner.userId, otherRestaurant.owned, "active");
  const unattachedPhotoId = randomUUIDv7();
  await seedReadyPhoto(database.get().sql, {
    mediaId: unattachedPhotoId,
    accountId: owner.userId,
    merchantId: menu.merchantId,
    kind: "item",
    now,
  });
  const { api, reads, storeVariant } = await openObservedMediaApi();
  const cover = await storeVariant(menu.coverId);
  const item = await storeVariant(menu.photoId);
  const otherItem = await storeVariant(otherMenu.photoId);
  await storeVariant(unattachedPhotoId);

  for (const path of [
    `/v1/merchants/${menu.slug}/categories/${otherMenu.categoryId}/items`,
    `/v1/merchants/${menu.slug}/items/${otherMenu.itemId}?expectedRevision=0`,
    profileVariant(otherMenu.merchantId, menu.coverId),
    profileVariant(menu.merchantId, menu.photoId),
    itemVariant(otherMenu.merchantId, menu.itemId, menu.photoId),
    itemVariant(menu.merchantId, otherMenu.itemId, menu.photoId),
    itemVariant(menu.merchantId, menu.itemId, otherMenu.photoId),
    itemVariant(menu.merchantId, menu.itemId, unattachedPhotoId),
    itemVariant(menu.merchantId, menu.itemId, menu.coverId),
  ]) {
    const response = await api.inject(path);
    expect(response.statusCode, path).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(problemResponseSchema.parse(response.json()).code).toBe("not_found");
  }
  expect(reads).toEqual([]);

  for (const [path, variant] of [
    [profileVariant(menu.merchantId, menu.coverId), cover],
    [itemVariant(menu.merchantId, menu.itemId, menu.photoId), item],
    [itemVariant(otherMenu.merchantId, otherMenu.itemId, otherMenu.photoId), otherItem],
  ] as const) {
    const response = await api.inject(path);
    expect(response.statusCode, path).toBe(200);
    expect(response.headers["content-type"]).toBe("image/webp");
    expect(response.rawPayload).toEqual(variant.bytes);
  }
  expect(reads).toEqual([cover.key, item.key, otherItem.key]);

  const list = await api.inject(`/v1/merchants/${menu.slug}/categories/${menu.categoryId}/items`);
  expect(list.statusCode).toBe(200);
  expect(publicRestaurantItemsOutput.parse(list.json()).items).toMatchObject([
    { itemId: menu.itemId },
  ]);
  const detail = await api.inject(
    `/v1/merchants/${menu.slug}/items/${menu.itemId}?expectedRevision=0`,
  );
  expect(detail.statusCode).toBe(200);
  expect(publicRestaurantItemOutput.parse(detail.json()).item.itemId).toBe(menu.itemId);

  const published = await api.inject(`/v1/merchants/${menu.slug}`);
  expect(published.statusCode).toBe(200);
  expect(published.body).toContain(menu.merchantId);
  expect(published.body).not.toContain(otherMenu.merchantId);
  await database.get().sql`
    UPDATE public.merchants SET status = 'suspended' WHERE id = ${otherMenu.merchantId}
  `;
  const hidden = await api.inject(`/v1/merchants/${otherMenu.slug}`);
  expect(hidden.statusCode).toBe(404);
  expect(hidden.body).not.toContain(otherMenu.merchantId);
});

test("[COU-05][AUTH-07] delivery proof stays bound to its order and the fulfilling restaurant", async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const [owner, staff, otherOwner, customer, courier] = await Promise.all([
    seedActor("+213500000153", "standard"),
    seedActor("+213500000154", "standard"),
    seedActor("+213500000155", "standard"),
    seedActor("+213500000156", "standard"),
    seedActor("+213500000157", "standard"),
  ]);
  const [restaurant] = await Promise.all([
    seedMenuMerchants(owner.userId, "1616"),
    seedMenuMerchants(otherOwner.userId, "1617"),
  ]);
  const merchantId = restaurant.owned;
  const { sql } = database.get();
  const courierId = randomUUIDv7();
  const orderId = randomUUIDv7();
  const otherOrderId = randomUUIDv7();
  const mediaId = randomUUIDv7();
  await sql`INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${staff.userId}, 'staff')`;
  await sql`INSERT INTO public.couriers (id, user_id, merchant_id, created_at)
    VALUES (${courierId}, ${courier.userId}, ${merchantId}, ${now.toISOString()})`;
  await sql`
    INSERT INTO public.orders (id, quote_id, customer_id, merchant_id, restaurant_name, short_code,
      order_day, status, fulfilment, version, placed_at, last_event_at, courier_id,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines)
    VALUES
      (${orderId}, ${randomUUIDv7()}, ${customer.userId}, ${merchantId}, 'Restaurant fictif',
       'BBB-222', '2026-11-21', 'out_for_delivery', 'delivery', 5, ${now.toISOString()},
       ${now.toISOString()}, ${courierId}, 1000, 100, 1100, 1100, '[]'),
      (${otherOrderId}, ${randomUUIDv7()}, ${customer.userId}, ${merchantId}, 'Restaurant fictif',
       'BBB-333', '2026-11-21', 'out_for_delivery', 'delivery', 5, ${now.toISOString()},
       ${now.toISOString()}, ${courierId}, 1000, 100, 1100, 1100, '[]')
  `;
  await seedReadyPhoto(sql, {
    mediaId,
    accountId: courier.userId,
    merchantId,
    deliveryOrderId: orderId,
    kind: "delivery_proof",
    now,
  });
  const { api, reads, storeVariant } = await openObservedMediaApi();
  const variant = await storeVariant(mediaId);
  const deliver = (targetId: string) =>
    api.inject({
      method: "POST",
      url: `/v1/orders/${targetId}/deliver`,
      headers: { ...courier.headers, "idempotency-key": randomUUIDv7() },
      payload: {
        expectedVersion: 5,
        proof: { kind: "photo", photoId: mediaId, reason: "Synthetic delivery" },
      },
    });
  const rejected = await deliver(otherOrderId);
  expect(rejected.statusCode).toBe(400);
  expect(problemResponseSchema.parse(rejected.json()).code).toBe("invalid_order_command");
  expect(await sql`SELECT status, version FROM public.orders WHERE id = ${otherOrderId}`).toEqual([
    { status: "out_for_delivery", version: 5 },
  ]);
  expect(
    await sql`SELECT FROM public.order_action_receipts WHERE order_id = ${otherOrderId}`,
  ).toEqual([]);
  expect(await sql`SELECT FROM public.order_events WHERE order_id = ${otherOrderId}`).toEqual([]);

  const delivered = await deliver(orderId);
  expect(delivered.statusCode).toBe(200);
  expect(delivered.json()).toMatchObject({ status: "delivered", version: 6 });
  expect(
    await sql`SELECT order_id, photo_id, merchant_id FROM public.order_delivery_photo_proofs
    WHERE order_id IN (${orderId}, ${otherOrderId})`,
  ).toEqual([{ order_id: orderId, photo_id: mediaId, merchant_id: merchantId }]);

  const mediaPath = `/v1/media/${mediaId}`;
  const variantPath = mediaPath + "/variants/webp/640";
  for (const actor of [otherOwner, customer, courier]) {
    for (const url of [mediaPath, variantPath]) {
      const response = await api.inject({ url, headers: actor.headers });
      expect(response.statusCode, url).toBe(404);
      expect(response.body).not.toContain(mediaId);
    }
  }
  expect(reads).toEqual([]);

  for (const actor of [owner, staff]) {
    const status = await api.inject({ url: mediaPath, headers: actor.headers });
    expect(status.statusCode).toBe(200);
    expect(mediaOutput.parse(status.json())).toMatchObject({ mediaId, status: "ready" });
    const response = await api.inject({ url: variantPath, headers: actor.headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.rawPayload).toEqual(variant.bytes);
  }
  expect(reads).toEqual([variant.key, variant.key]);
});

test("[MER-14][AUTH-07] a co-editor can read only attached ready photos in their restaurant", async () => {
  const [uploader, manager, staff, foreignOwner] = await Promise.all([
    seedActor("+213500000181", "standard"),
    seedActor("+213500000182", "standard"),
    seedActor("+213500000183", "standard"),
    seedActor("+213500000184", "standard"),
  ]);
  const [restaurant] = await Promise.all([
    seedMenuMerchants(uploader.userId, "1622"),
    seedMenuMerchants(foreignOwner.userId, "1623"),
  ]);
  const { merchantId, coverId, photoId } = await seedMenu(
    uploader.userId,
    restaurant.owned,
    "approved",
  );
  const { sql } = database.get();
  await sql`INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${manager.userId}, 'manager'), (${merchantId}, ${staff.userId}, 'staff')`;
  const unattachedId = randomUUIDv7();
  await seedReadyPhoto(sql, {
    mediaId: unattachedId,
    accountId: uploader.userId,
    merchantId,
    kind: "item",
    now,
  });
  const { api, reads, storeVariant } = await openObservedMediaApi();
  const attached = await Promise.all(
    [coverId, photoId].map(async (mediaId) => ({
      mediaId,
      variant: await storeVariant(mediaId),
    })),
  );
  const unattached = await storeVariant(unattachedId);
  const expectHidden = async (actor: typeof manager, mediaId: string) => {
    const path = `/v1/media/${mediaId}`;
    for (const url of [path, path + "/variants/webp/640"]) {
      const response = await api.inject({ url, headers: actor.headers });
      expect(response.statusCode, url).toBe(404);
      expect(response.body).not.toContain(mediaId);
    }
  };
  for (const { mediaId } of attached) {
    await expectHidden(foreignOwner, mediaId);
    await expectHidden(staff, mediaId);
  }
  await expectHidden(manager, unattachedId);
  expect(reads).toEqual([]);

  for (const { mediaId, variant } of attached) {
    const path = `/v1/media/${mediaId}`;
    const metadata = await api.inject({ url: path, headers: manager.headers });
    expect(metadata.statusCode).toBe(200);
    expect(mediaOutput.parse(metadata.json())).toMatchObject({
      mediaId,
      sessionId: manager.sessionId,
      status: "ready",
    });
    const response = await api.inject({
      url: path + "/variants/webp/640",
      headers: manager.headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.rawPayload).toEqual(variant.bytes);
  }
  const uploaderResponse = await api.inject({
    url: `/v1/media/${unattachedId}/variants/webp/640`,
    headers: uploader.headers,
  });
  expect(uploaderResponse.statusCode).toBe(200);
  expect(uploaderResponse.rawPayload).toEqual(unattached.bytes);
  expect(reads).toEqual([...attached.map(({ variant }) => variant.key), unattached.key]);
});
