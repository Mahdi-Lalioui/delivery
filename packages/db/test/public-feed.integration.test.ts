import { publicFeedOutput } from "@zaafran/contracts/feed";
import { beforeAll, expect, test } from "vitest";
import { createPublicFeedRepository } from "../src/public-feed.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

const database = registerTestDatabase();
const repository = () => createPublicFeedRepository(database.get());
const now = new Date("2026-11-08T00:30:00.000Z");
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const communeId = id(1);
const accountId = id(2);
const overnightId = id(10);
const pendingId = id(11);
const specialClosureId = id(12);
const approvedId = id(13);
const temporarilyPausedId = id(14);
const pausedId = id(15);
const datedHoursId = id(16);
const demoId = id(17);
const noHoursId = id(18);
const suspendedId = id(19);
const rejectedId = id(20);
const coverId = id(30);
const logoId = id(31);
const replacementCoverId = id(32);
const pendingCoverId = id(33);
const itemId = id(34);
const demoCoverId = id(35);
const pausedCoverId = id(36);

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'تجريبي', 'Test') ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'تجريبي', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
  `;
  await sql`INSERT INTO users (id, phone_e164, created_at)
    VALUES (${accountId}, '+213500000001', ${now.toISOString()})`;

  for (const [merchantId, status] of [
    [noHoursId, "active"],
    [suspendedId, "suspended"],
    [overnightId, "active"],
    [pendingId, "pending_review"],
    [specialClosureId, "active"],
    [approvedId, "approved"],
    [temporarilyPausedId, "active"],
    [pausedId, "paused"],
    [datedHoursId, "active"],
    [demoId, "active"],
    [rejectedId, "rejected"],
  ] as const) {
    await sql`
      INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
        location, cuisines, status, created_at, is_demo)
      VALUES (${merchantId}, ${`fixture-${merchantId}`}, 'Restaurant fictif', 'Propriétaire fictif',
        '+213500000000', ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326),
        ARRAY['algerian', 'grill'], ${status}, ${now.toISOString()}, ${merchantId === demoId})
    `;
  }
  await sql`
    INSERT INTO merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
    VALUES (${overnightId}, 6, 1320, 120), (${specialClosureId}, 6, 1320, 120),
      (${temporarilyPausedId}, 6, 1320, 120)
  `;
  await sql`
    INSERT INTO merchant_special_dates (merchant_id, local_date)
    VALUES (${specialClosureId}, '2026-11-08'), (${datedHoursId}, '2026-12-23')
  `;
  await sql`
    INSERT INTO merchant_special_hours (merchant_id, local_date, opens_minute, closes_minute)
    VALUES (${datedHoursId}, '2026-12-23', 660, 720)
  `;
  await sql`
    UPDATE merchants SET hours_paused_until = '2026-11-08T00:45:30.000Z'
    WHERE id = ${temporarilyPausedId}
  `;

  for (const [mediaId, kind, merchantId] of [
    [coverId, "cover", overnightId],
    [logoId, "logo", overnightId],
    [replacementCoverId, "cover", overnightId],
    [itemId, "item", specialClosureId],
    [demoCoverId, "cover", demoId],
    [pausedCoverId, "cover", pausedId],
  ] as const) {
    await seedReadyPhoto(sql, { mediaId, accountId, merchantId, kind, now });
  }
  await sql`
    INSERT INTO media_uploads (id, owner_id, merchant_id, kind, content_type, bytes, created_at)
    VALUES (${pendingCoverId}, ${accountId}, ${temporarilyPausedId}, 'cover', 'image/png', 16, ${now.toISOString()})
  `;
  await sql`
    UPDATE merchants SET cover_photo_id = ${coverId}, logo_photo_id = ${logoId}
    WHERE id = ${overnightId}
  `;
  await sql`UPDATE merchants SET cover_photo_id = ${pendingCoverId} WHERE id = ${temporarilyPausedId}`;
  await sql`UPDATE merchants SET cover_photo_id = ${itemId} WHERE id = ${specialClosureId}`;
  await sql`UPDATE merchants SET cover_photo_id = ${demoCoverId} WHERE id = ${demoId}`;
  await sql`UPDATE merchants SET cover_photo_id = ${pausedCoverId} WHERE id = ${pausedId}`;
});

test("[CUS-01:db] pages only active public restaurants in UUID order", async () => {
  const repo = repository();
  const first = await repo.list({ limit: 2, now });
  expect(first.restaurants.map(({ merchantId }) => merchantId)).toEqual([
    overnightId,
    specialClosureId,
  ]);
  expect(first.nextCursor).toBe(specialClosureId);
  const second = await repo.list({ limit: 2, cursor: specialClosureId, now });
  expect(second.restaurants.map(({ merchantId }) => merchantId)).toEqual([
    temporarilyPausedId,
    datedHoursId,
  ]);
  expect(second.nextCursor).toBe(datedHoursId);
  const last = await repo.list({ limit: 2, cursor: datedHoursId, now });
  expect(last.restaurants.map(({ merchantId }) => merchantId)).toEqual([noHoursId]);
  expect(last.nextCursor).toBeNull();
  expect(await repo.list({ limit: 2, cursor: noHoursId, now })).toEqual({
    restaurants: [],
    nextCursor: null,
  });
});

test("[CUS-04:db] projects only customer fields and ready attachments of the right kind", async () => {
  const { restaurants } = await repository().list({ limit: 10, now });
  expect(restaurants[0]).toEqual({
    merchantId: overnightId,
    slug: `fixture-${overnightId}`,
    name: "Restaurant fictif",
    cuisines: ["algerian", "grill"],
    communeId,
    coverMediaId: coverId,
    logoMediaId: logoId,
    isOpen: true,
    nextOpensAt: null,
  });
  for (const merchantId of [specialClosureId, temporarilyPausedId, noHoursId]) {
    expect(restaurants.find((restaurant) => restaurant.merchantId === merchantId)).toMatchObject({
      coverMediaId: null,
      logoMediaId: null,
    });
  }
});

test("[CUS-04:db] reports exact openings across Algiers overnight hours, dated closures and pauses", async () => {
  const { restaurants } = await repository().list({ limit: 10, now });
  expect(
    restaurants.map(({ merchantId, isOpen, nextOpensAt }) => [merchantId, isOpen, nextOpensAt]),
  ).toEqual([
    [overnightId, true, null],
    [specialClosureId, false, "2026-11-14T21:00:00.000Z"],
    [temporarilyPausedId, false, "2026-11-08T00:45:30.000Z"],
    [datedHoursId, false, "2026-12-23T10:00:00.000Z"],
    [noHoursId, false, null],
  ]);
});

test("[CUS-04:db] resolves a specific stored variant only for current public profile photos", async () => {
  const repo = repository();
  const read = (merchantId: string, mediaId: string) =>
    repo.readPhoto({ merchantId, mediaId, format: "webp", width: 640 });
  await expect(read(overnightId, coverId)).resolves.toEqual({
    key: `variants/${coverId}/640.webp`,
  });
  await expect(
    repo.readPhoto({ merchantId: overnightId, mediaId: logoId, format: "avif", width: 160 }),
  ).resolves.toEqual({ key: `variants/${logoId}/160.avif` });

  for (const [merchantId, mediaId] of [
    [specialClosureId, coverId],
    [overnightId, replacementCoverId],
    [specialClosureId, itemId],
    [temporarilyPausedId, pendingCoverId],
    [demoId, demoCoverId],
    [pausedId, pausedCoverId],
  ] as const) {
    await expect(read(merchantId, mediaId)).resolves.toBeUndefined();
  }

  const { sql } = database.get();
  await sql`
    UPDATE merchants SET cover_photo_id = ${replacementCoverId} WHERE id = ${overnightId}
  `;
  try {
    await expect(read(overnightId, coverId)).resolves.toBeUndefined();
    await expect(read(overnightId, replacementCoverId)).resolves.toEqual({
      key: `variants/${replacementCoverId}/640.webp`,
    });
  } finally {
    await sql`UPDATE merchants SET cover_photo_id = ${coverId} WHERE id = ${overnightId}`;
  }
});

test("[CUS-01:db] the public keyset can use the partial UUID index", async () => {
  const { sql } = database.get();
  const plan = await sql.begin(async (tx) => {
    await tx`SET LOCAL enable_seqscan = off`;
    return tx`
      EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM public.merchants
      WHERE status = 'active' AND NOT is_demo AND id > ${overnightId}::uuid
      ORDER BY id LIMIT 3
    `;
  });
  expect(JSON.stringify(plan)).toContain("merchants_public_feed_idx");
});

test("[CUS-04:db] omits an opening outside the public timestamp format without hiding the page", async () => {
  const { sql } = database.get();
  await sql`UPDATE merchants SET hours_paused_until = '9999-12-31T23:00:00Z'
    WHERE id = ${temporarilyPausedId}`;
  const page = await repository().list({ limit: 24, now });
  expect(publicFeedOutput.parse(page).restaurants).toContainEqual(
    expect.objectContaining({ merchantId: temporarilyPausedId, isOpen: false, nextOpensAt: null }),
  );
});

test("[CUS-06:db] open filtering respects pauses and dated exceptions before pagination", async () => {
  const repo = repository();
  const page = await repo.list({ limit: 1, now, openNow: true, cuisine: "algerian" });
  expect(page.restaurants.map(({ merchantId }) => merchantId)).toEqual([overnightId]);
  expect(page.nextCursor).toBeNull();
  expect(
    (await repo.list({ limit: 10, now, openNow: false })).restaurants.map(
      ({ merchantId }) => merchantId,
    ),
  ).toEqual([specialClosureId, temporarilyPausedId, datedHoursId, noHoursId]);
  expect((await repo.list({ limit: 10, now, cuisine: "pizza" })).restaurants).toEqual([]);
});

test("[CUS-04][CUS-06:db] publishes delivery estimates and ratings with filtered stable sorting", async () => {
  const { sql } = database.get();
  await sql`INSERT INTO merchant_order_settings (merchant_id, delivery_enabled, prep_minutes, price_level)
    VALUES (${overnightId}, true, 15, 2), (${specialClosureId}, true, 20, 1)`;
  await sql`INSERT INTO delivery_zones (merchant_id, radius_m, fee_dzd, minimum_dzd, travel_minutes)
    VALUES (${overnightId}, 2000, 0, 600, 5), (${specialClosureId}, 2000, 100, 400, 15)`;
  await sql`
    INSERT INTO orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day, status,
      fulfilment, version, placed_at, last_event_at, subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    )
    VALUES
      (${id(50)}, ${id(52)}, ${accountId}, ${overnightId}, 'Test', 'AAA-222', current_date,
       'delivered', 'delivery', 1, now(), now(), 1000, 0, 1000, 1000, '[]'),
      (${id(51)}, ${id(53)}, ${accountId}, ${specialClosureId}, 'Test', 'AAA-222', current_date,
       'delivered', 'delivery', 1, now(), now(), 1000, 100, 1100, 1100, '[]')
  `;
  await sql`INSERT INTO ratings (order_id, food_stars) VALUES (${id(50)}, 4), (${id(51)}, 5)`;
  const repo = repository();
  const filtered = await repo.list({
    limit: 2,
    now,
    freeDelivery: true,
    maxEtaMinutes: 30,
    priceLevel: 2,
    communeId,
  });
  expect(filtered.restaurants).toMatchObject([
    {
      merchantId: overnightId,
      rating: 4,
      ratingCount: 1,
      etaMinutes: { min: 20, max: 30 },
      deliveryFeeDzd: 0,
      minimumOrderDzd: 600,
      priceLevel: 2,
    },
  ]);
  const first = await repo.list({ limit: 1, now, minRating: 4, sort: "rating" });
  expect(first.restaurants.map(({ merchantId }) => merchantId)).toEqual([specialClosureId]);
  expect(first.nextCursor).toBe(specialClosureId);
  const next = await repo.list({
    limit: 1,
    now,
    minRating: 4,
    sort: "rating",
    cursor: specialClosureId,
  });
  expect(next.restaurants.map(({ merchantId }) => merchantId)).toEqual([overnightId]);
  expect(next.nextCursor).toBeNull();
  expect(
    (await repo.list({ limit: 2, now, sort: "eta" })).restaurants.map(
      ({ merchantId }) => merchantId,
    ),
  ).toEqual([overnightId, specialClosureId]);
  await sql`UPDATE delivery_zones SET fee_dzd = 100 - fee_dzd
    WHERE merchant_id IN (${overnightId}, ${specialClosureId})`;
  const feeFirst = await repo.list({ limit: 1, now, sort: "fee", communeId });
  expect(feeFirst.restaurants).toMatchObject([{ merchantId: specialClosureId, deliveryFeeDzd: 0 }]);
  expect(feeFirst.nextCursor).toBe(specialClosureId);
  const feeNext = await repo.list({
    limit: 2,
    now,
    sort: "fee",
    communeId,
    cursor: specialClosureId,
  });
  expect(
    feeNext.restaurants.map(({ merchantId, deliveryFeeDzd }) => [merchantId, deliveryFeeDzd]),
  ).toEqual([
    [overnightId, 100],
    [temporarilyPausedId, undefined],
  ]);
  expect((await repo.list({ limit: 2, now, acceptsTpe: true })).restaurants).toEqual([]);
});

test("[CUS-06:db] distance uses the selected commune and stable ties", async () => {
  const { sql } = database.get();
  await sql`UPDATE merchants SET location = ST_GeogFromText('SRID=4326;POINT(3.50 36.76)')
    WHERE id = ${temporarilyPausedId}`;
  const repo = repository();
  const first = await repo.list({ now, limit: 3, sort: "distance", communeId });
  expect(first.restaurants.map(({ merchantId }) => merchantId)).toEqual([
    overnightId,
    specialClosureId,
    datedHoursId,
  ]);
  expect(first.nextCursor).toBe(datedHoursId);
  expect(first.restaurants.map(({ distanceMeters }) => distanceMeters)).toEqual([0, 0, 0]);
  expect((await repo.list({ now, limit: 1 })).restaurants[0]).not.toHaveProperty("distanceMeters");
  const next = await repo.list({
    now,
    limit: 3,
    sort: "distance",
    communeId,
    cursor: datedHoursId,
  });
  expect(next.restaurants.map(({ merchantId }) => merchantId)).toEqual([
    noHoursId,
    temporarilyPausedId,
  ]);
  expect(next.restaurants.at(-1)?.distanceMeters).toBeGreaterThan(39_000);
  expect(next.nextCursor).toBeNull();
});

test("[CUS-06:db] lists pickup locations, future openings and approved vegetarian dishes", async () => {
  const { sql } = database.get();
  await sql`
    UPDATE merchants SET hours_paused_until = '2026-11-08T00:45:30.000Z',
      location = ST_GeogFromText('SRID=4326;POINT(3.50 36.76)')
    WHERE id = ${temporarilyPausedId}
  `;
  await sql`
    INSERT INTO merchant_order_settings (merchant_id, pickup_enabled, pickup_minimum_dzd, delivery_enabled)
    VALUES (${temporarilyPausedId}, true, 350, true), (${demoId}, true, 0, false)
  `;
  await sql`
    INSERT INTO delivery_zones (merchant_id, radius_m, fee_dzd, minimum_dzd, travel_minutes)
    VALUES (${temporarilyPausedId}, 50000, 60, 500, 20)
  `;
  await sql`
    INSERT INTO categories (id, merchant_id, names, sort)
    VALUES (${id(70)}, ${temporarilyPausedId}, '{"fr":"Plats"}', 0),
      (${id(71)}, ${noHoursId}, '{"fr":"Plats"}', 0)
  `;
  await sql`
    INSERT INTO items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
      prep_extra_min, moderation_status)
    VALUES (${id(72)}, ${temporarilyPausedId}, ${id(70)}, '{"fr":"Légumes"}', '{"fr":"Légumes grillés"}',
      350, ARRAY['vegetarian'], 0, 'approved'),
      (${id(73)}, ${noHoursId}, ${id(71)}, '{"fr":"Plat"}', '{"fr":"Plat fictif"}',
      350, ARRAY['vegetarian'], 0, 'blocked_pending_review')
  `;
  const repo = repository();
  const pickup = await repo.list({ now, limit: 10, fulfilment: "pickup" });
  expect(publicFeedOutput.parse(pickup).restaurants).toMatchObject([
    {
      merchantId: temporarilyPausedId,
      offersPickup: true,
      minimumOrderDzd: 350,
      pin: { latitude: 36.76, longitude: 3.5 },
      dietary: ["vegetarian"],
      isOpen: false,
    },
  ]);
  expect(pickup.restaurants).toHaveLength(1);
  expect(pickup.restaurants[0]).not.toHaveProperty("deliveryFeeDzd");
  const delivery = await repo.list({ now, limit: 10, fulfilment: "delivery", communeId });
  expect(
    delivery.restaurants.find(({ merchantId }) => merchantId === temporarilyPausedId),
  ).toMatchObject({ deliveryFeeDzd: 60, minimumOrderDzd: 500 });
  expect(delivery.restaurants.every(({ deliveryFeeDzd }) => deliveryFeeDzd !== undefined)).toBe(
    true,
  );
  expect(
    (await repo.list({ now, limit: 10, dietary: "vegetarian" })).restaurants.map(
      ({ merchantId }) => merchantId,
    ),
  ).toEqual([temporarilyPausedId]);

  const at = "2026-11-08T00:50:00.000Z";
  const scheduled = await repo.list({ now, limit: 10, fulfilment: "pickup", availableAt: at });
  expect(scheduled.restaurants.map(({ merchantId, isOpen }) => [merchantId, isOpen])).toEqual([
    [temporarilyPausedId, false],
  ]);
  expect(
    (await repo.list({ now, limit: 10, fulfilment: "pickup", availableAt: now.toISOString() }))
      .restaurants,
  ).toEqual([]);

  await sql`UPDATE categories SET available_from = '01:45', available_to = '02:00'
    WHERE id = ${id(70)}`;
  expect((await repo.list({ now, limit: 10, dietary: "vegetarian" })).restaurants).toEqual([]);
  expect(
    (await repo.list({ now, limit: 10, availableAt: at, dietary: "vegetarian" })).restaurants,
  ).toHaveLength(1);
  await sql`UPDATE categories SET available_from = NULL, available_to = NULL WHERE id = ${id(70)}`;

  await sql.begin(async (tx) => {
    await tx`INSERT INTO option_groups (id, merchant_id, names, minimum, maximum)
      VALUES (${id(74)}, ${temporarilyPausedId}, '{"fr":"Accompagnement"}', 1, 1)`;
    await tx`INSERT INTO options (id, merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
      VALUES (${id(75)}, ${temporarilyPausedId}, ${id(74)}, '{"fr":"Riz"}', 0, false, false, 0)`;
    await tx`INSERT INTO item_option_groups (merchant_id, item_id, group_id, sort)
      VALUES (${temporarilyPausedId}, ${id(72)}, ${id(74)}, 0)`;
  });
  expect((await repo.list({ now, limit: 10, dietary: "vegetarian" })).restaurants).toEqual([]);
  expect(
    (await repo.list({ now, limit: 10, fulfilment: "pickup" })).restaurants[0],
  ).not.toHaveProperty("dietary");
  await sql`UPDATE options SET is_available = true WHERE id = ${id(75)}`;
  expect((await repo.list({ now, limit: 10, dietary: "vegetarian" })).restaurants).toHaveLength(1);
  await sql`UPDATE options SET names = '{"fr":"Vin"}' WHERE id = ${id(75)}`;
  expect((await repo.list({ now, limit: 10, dietary: "vegetarian" })).restaurants).toEqual([]);
});

test("[CUS-06:db] counts all matching restaurants across pages and uses the correct minimum order", async () => {
  const { sql } = database.get();
  for (const [merchantId, publishedAt, minimum] of [
    [overnightId, "2026-11-06T12:00:00Z", 800],
    [datedHoursId, "2026-10-10T12:00:00Z", 1000],
    [noHoursId, "2026-10-06T12:00:00Z", 500],
    [specialClosureId, "2026-11-06T12:00:00Z", 1001],
  ] as const) {
    await sql`UPDATE merchants SET first_published_at = ${publishedAt} WHERE id = ${merchantId}`;
    await sql`INSERT INTO merchant_order_settings (merchant_id, pickup_enabled, pickup_minimum_dzd)
      VALUES (${merchantId}, true, ${minimum})
      ON CONFLICT (merchant_id) DO UPDATE SET pickup_enabled = true, pickup_minimum_dzd = ${minimum}`;
  }
  const repo = repository();
  const query = {
    now,
    limit: 1,
    fulfilment: "pickup",
    newOnly: true,
    maxMinimumOrderDzd: 1000,
    includeCount: true,
    sort: "rating",
  } as const;
  const first = publicFeedOutput.parse(await repo.list(query));
  expect(first.restaurants).toMatchObject([
    { merchantId: overnightId, isNew: true, minimumOrderDzd: 800 },
  ]);
  expect(first.nextCursor).toBe(overnightId);
  expect(first.totalCount).toBe(2);
  const second = await repo.list({ ...query, cursor: overnightId });
  expect(second.restaurants).toMatchObject([
    { merchantId: datedHoursId, isNew: true, minimumOrderDzd: 1000 },
  ]);
  expect(second.nextCursor).toBeNull();
  expect(second.totalCount).toBe(2);
  expect(await repo.list({ ...query, cursor: datedHoursId })).toEqual({
    restaurants: [],
    nextCursor: null,
    totalCount: 2,
  });
  expect(await repo.list({ ...query, maxMinimumOrderDzd: 300 })).toEqual({
    restaurants: [],
    nextCursor: null,
    totalCount: 0,
  });
  expect(await repo.list({ ...query, includeCount: false })).not.toHaveProperty("totalCount");
  expect((await repo.list({ ...query, newOnly: false })).restaurants[0]).not.toHaveProperty(
    "isNew",
  );
});

test("[CUS-06:db] records the first public activation without resetting it on resumption", async () => {
  const { sql } = database.get();
  const publishedAt = () => sql<{ publishedAt: string | null }[]>`
    SELECT first_published_at::text AS "publishedAt" FROM merchants WHERE id = ${approvedId}
  `;
  expect((await publishedAt())[0]?.publishedAt).toBeNull();
  await sql`UPDATE merchants SET status = 'active' WHERE id = ${approvedId}`;
  const first = (await publishedAt())[0]?.publishedAt;
  expect(first).toBeTruthy();
  await sql`UPDATE merchants SET status = 'suspended' WHERE id = ${approvedId}`;
  await sql`UPDATE merchants SET status = 'active' WHERE id = ${approvedId}`;
  expect((await publishedAt())[0]?.publishedAt).toBe(first);
});

test("[CUS-06] public offers exclude codes and unavailable promotions and count only matches", async () => {
  const { sql } = database.get();
  await sql`
    INSERT INTO promotions (merchant_id, code, discount, conditions, created_at, updated_at)
    VALUES
      (${overnightId}, NULL, '{"kind":"fixed","amountDzd":150}', '{"minimumSubtotalDzd":600}', now(), now()),
      (${noHoursId}, 'PRIVATE', '{"kind":"fixed","amountDzd":500}', '{}', now(), now()),
      (${noHoursId}, NULL, '{"kind":"fixed","amountDzd":250}', '{"maxUsesTotal":0}', now(), now()),
      (${specialClosureId}, NULL, '{"kind":"fixed","amountDzd":100}', '{"endsOn":"2026-11-07"}', now(), now())
  `;
  const repo = repository();
  const result = await repo.list({ now, limit: 2, offers: true, includeCount: true });
  expect(result.totalCount).toBe(1);
  expect(result.restaurants).toMatchObject([
    { merchantId: overnightId, offer: { kind: "fixed", amountDzd: 150, minimumSubtotalDzd: 600 } },
  ]);
  expect(
    (await repo.list({ now, limit: 10 })).restaurants.every(({ offer }) => offer === undefined),
  ).toBe(true);
});
