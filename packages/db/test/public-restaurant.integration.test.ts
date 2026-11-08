import {
  publicRestaurantItemOutput,
  publicRestaurantItemsOutput,
  publicRestaurantOutput,
} from "@zaafran/contracts/restaurant";
import { beforeAll, expect, test } from "vitest";
import { createPublicRestaurantRepository } from "../src/public-restaurant.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

const database = registerTestDatabase();
const repository = () => createPublicRestaurantRepository(database.get());
const now = new Date("2026-11-08T12:00:00.000Z");
const deadline = new Date("2026-11-08T12:30:00.000Z");
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const merchantId = id(10);
const categoryId = id(20);
const alternateCategoryId = id(21);
const foreignCategoryId = id(22);
const visible = id(30);
const held = id(31);
const rejected = id(32);
const archived = id(33);
const legacy = id(34);
const approved = id(80);
const soldOut = id(81);
const foreign = id(82);
const differentCategory = id(83);
const readyPhoto = id(90);
const pendingPhoto = id(91);
const coverPhoto = id(92);
const firstGroup = id(101);
const secondGroup = id(100);
const firstOption = id(103);
const secondOption = id(102);
const slug = `fixture-${merchantId}`;
const page = { slug, categoryId, now, limit: 1 };
const detail = { slug, itemId: soldOut, expectedRevision: 7, now };

async function seedRestaurants() {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'اختبار', 'Test') ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${id(1)}, '1698', 16, 'اختبار', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.765), 4326))
  `;
  await sql`INSERT INTO users (id, phone_e164, created_at)
    VALUES (${id(2)}, '+213500000001', ${now.toISOString()})`;
  for (const [serial, status] of [
    [10, "active"],
    [11, "active"],
    [12, "pending_review"],
    [13, "approved"],
    [14, "paused"],
    [15, "suspended"],
    [16, "rejected"],
    [17, "active"],
  ] as const) {
    await sql`
      INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
        location, cuisines, status, created_at, menu_revision, is_demo)
      VALUES (${id(serial)}, ${`fixture-${id(serial)}`}, 'Restaurant fictif', 'Propriétaire privé',
        '+213500000000', ${id(1)}, ST_SetSRID(ST_MakePoint(3.05, 36.765), 4326),
        ARRAY['algerian'], ${status}, ${now.toISOString()}, 7, ${serial === 17})
    `;
  }
  await sql`
    INSERT INTO categories (id, merchant_id, names, sort, available_from, available_to)
    VALUES (${alternateCategoryId}, ${merchantId}, '{"fr":"Desserts"}', 1, '18:00', '02:00'),
      (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0, null, null),
      (${foreignCategoryId}, ${id(11)}, '{"fr":"Autres"}', 0, null, null)
  `;
  await sql`INSERT INTO merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
    VALUES (${merchantId}, 0, 720, 840)`;
  await sql`INSERT INTO merchant_special_dates (merchant_id, local_date)
    VALUES (${merchantId}, '2026-11-09')`;
}

async function seedItems() {
  const { sql } = database.get();
  for (const [mediaId, kind] of [
    [readyPhoto, "item"],
    [coverPhoto, "cover"],
  ] as const) {
    await seedReadyPhoto(sql, { mediaId, kind, merchantId, accountId: id(2), now });
  }
  await sql`UPDATE merchants SET cover_photo_id = ${coverPhoto} WHERE id = ${merchantId}`;
  await sql`
    INSERT INTO media_uploads (id, owner_id, merchant_id, kind, content_type, bytes, created_at)
    VALUES (${pendingPhoto}, ${id(2)}, ${merchantId}, 'item', 'image/png', 16, ${now.toISOString()})
  `;
  for (const [itemId, status, name, merchant, category] of [
    [visible, "unreviewed", "Plat de test", merchantId, categoryId],
    [held, "blocked_pending_review", "Plat retenu", merchantId, categoryId],
    [rejected, "rejected", "Plat rejeté", merchantId, categoryId],
    [archived, "approved", "Plat archivé", merchantId, categoryId],
    [approved, "approved", "Cocktail sans alcool", merchantId, categoryId],
    [soldOut, "unreviewed", "Plat épuisé", merchantId, categoryId],
    [foreign, "approved", "Autre restaurant", id(11), foreignCategoryId],
    [differentCategory, "approved", "Dessert", merchantId, alternateCategoryId],
  ] as const) {
    await sql`
      INSERT INTO items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
        prep_extra_min, moderation_status)
      VALUES (${itemId}, ${merchant}, ${category}, jsonb_build_object('fr', ${name}::text),
        '{"fr":"Description de test"}', 1290, ARRAY['new'], 12, ${status})
    `;
  }
  await sql`
    INSERT INTO items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
      prep_extra_min, moderation_status)
    SELECT ('01932f18-3150-7c33-8a7a-' || lpad(serial::text, 12, '0'))::uuid,
      ${merchantId}, ${categoryId}, '{"fr":"Ancien plat"}', '{"ar":"مشروب بالفودكا"}',
      1290, ARRAY['new'], 12, 'unreviewed'
    FROM generate_series(34, 79) AS rows(serial)
  `;
  await sql`UPDATE items SET archived_at = ${now.toISOString()} WHERE id = ${archived}`;
  await sql`UPDATE items SET photo_id = ${readyPhoto} WHERE id = ${visible}`;
  await sql`UPDATE items SET photo_id = ${coverPhoto} WHERE id = ${approved}`;
  await sql`UPDATE items SET photo_id = ${pendingPhoto}, is_available = false,
    sold_out_until = ${deadline.toISOString()} WHERE id = ${soldOut}`;
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO option_groups (id, merchant_id, names, minimum, maximum)
      VALUES (${firstGroup}, ${merchantId}, '{"fr":"Sauces"}', 1, 1),
        (${secondGroup}, ${merchantId}, '{"fr":"Garnitures"}', 0, 1)
    `;
    await tx`
      INSERT INTO options (id, merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
      VALUES (${firstOption}, ${merchantId}, ${firstGroup}, '{"fr":"Citron"}', 20, true, true, 0),
        (${secondOption}, ${merchantId}, ${secondGroup}, '{"fr":"Olives"}', 50, false, false, 0)
    `;
    await tx`INSERT INTO item_option_groups (merchant_id, item_id, group_id, sort)
      VALUES (${merchantId}, ${soldOut}, ${secondGroup}, 1),
        (${merchantId}, ${soldOut}, ${firstGroup}, 0)`;
  });
}

beforeAll(async () => {
  await seedRestaurants();
  await seedItems();
});

test("[CUS-07:db] anonymously reads public profile, regular hours and categories in stored order", async () => {
  const result = await repository().read({ slug, now });
  expect(result).toMatchObject({
    kind: "found",
    revision: 7,
    restaurant: {
      merchantId,
      slug,
      name: "Restaurant fictif",
      coverMediaId: coverPhoto,
      isOpen: true,
      nextOpensAt: null,
      pausedUntil: null,
      hours: {
        weekly: [
          { weekday: 0, ranges: [{ opensMinute: 720, closesMinute: 840 }] },
          { weekday: 1, ranges: [] },
          { weekday: 2, ranges: [] },
          { weekday: 3, ranges: [] },
          { weekday: 4, ranges: [] },
          { weekday: 5, ranges: [] },
          { weekday: 6, ranges: [] },
        ],
        specialDates: [{ date: "2026-11-09", ranges: [] }],
      },
    },
    categories: [
      { categoryId, position: 0, names: { fr: "Plats" }, availability: null },
      {
        categoryId: alternateCategoryId,
        position: 1,
        names: { fr: "Desserts" },
        availability: { from: "18:00", to: "02:00" },
      },
    ],
  });
  if (result.kind !== "found") throw new Error("Missing restaurant fixture");
  const { kind, ...output } = result;
  expect(kind).toBe("found");
  expect(publicRestaurantOutput.parse(output)).toEqual(output);
  expect(result.restaurant.hours.weekly).toHaveLength(7);
});

test("[CUS-01:db] inactive and demonstration restaurants are absent from every public read", async () => {
  for (const serial of [12, 13, 14, 15, 16, 17, 999]) {
    const hiddenSlug = `fixture-${id(serial)}`;
    await expect(repository().read({ slug: hiddenSlug, now })).resolves.toEqual({
      kind: "not_found",
    });
    await expect(repository().list({ ...page, slug: hiddenSlug })).resolves.toEqual({
      kind: "not_found",
    });
    await expect(repository().detail({ ...detail, slug: hiddenSlug })).resolves.toEqual({
      kind: "not_found",
    });
  }
});

test("[CUS-07:db] public pages screen moderation before pagination without dropping later visible items", async () => {
  const repo = repository();
  const first = await repo.list(page);
  expect(first).toMatchObject({
    kind: "listed",
    revision: 7,
    items: [{ itemId: visible, photoId: readyPhoto }],
    nextCursor: `7~${visible}`,
  });
  if (first.kind !== "listed") throw new Error("Missing category fixture");
  const { kind, ...output } = first;
  expect(kind).toBe("listed");
  expect(publicRestaurantItemsOutput.parse(output)).toEqual(output);
  await expect(
    repo.list({ ...page, cursor: { revision: 7, itemId: visible } }),
  ).resolves.toMatchObject({
    kind: "listed",
    items: [{ itemId: approved, photoId: null }],
    nextCursor: `7~${approved}`,
  });
  await expect(
    repo.list({ ...page, cursor: { revision: 7, itemId: approved } }),
  ).resolves.toMatchObject({
    kind: "listed",
    items: [{ itemId: soldOut, isAvailable: false, photoId: null }],
    nextCursor: null,
  });
});

test("[CUS-07:db] category and cursor scope cannot cross merchants, categories or hidden items", async () => {
  const repo = repository();
  await expect(repo.list({ ...page, categoryId: foreignCategoryId })).resolves.toEqual({
    kind: "not_found",
  });
  for (const itemId of [held, rejected, archived, legacy, foreign, differentCategory]) {
    await expect(repo.list({ ...page, cursor: { revision: 7, itemId } })).resolves.toEqual({
      kind: "invalid_cursor",
    });
  }
  for (const itemId of [held, rejected, archived, legacy, foreign]) {
    await expect(repo.detail({ ...detail, itemId })).resolves.toEqual({ kind: "not_found" });
  }
  await expect(repo.list({ ...page, cursor: { revision: 6, itemId: visible } })).resolves.toEqual({
    kind: "revision_conflict",
  });
  await expect(repo.detail({ ...detail, expectedRevision: 6 })).resolves.toEqual({
    kind: "revision_conflict",
  });
});

test("[CUS-08:db] public detail preserves option rules, order, deltas and sold-out deadline", async () => {
  const result = await repository().detail(detail);
  expect(result).toMatchObject({
    kind: "found",
    revision: 7,
    item: { itemId: soldOut, isAvailable: false },
    optionGroups: [
      {
        optionGroupId: firstGroup,
        minimum: 1,
        maximum: 1,
        options: [{ optionId: firstOption, priceDeltaDzd: 20, isDefault: true, isAvailable: true }],
      },
      {
        optionGroupId: secondGroup,
        minimum: 0,
        maximum: 1,
        options: [
          { optionId: secondOption, priceDeltaDzd: 50, isDefault: false, isAvailable: false },
        ],
      },
    ],
  });
  if (result.kind !== "found") throw new Error("Missing item fixture");
  const { kind, ...output } = result;
  expect(kind).toBe("found");
  expect(publicRestaurantItemOutput.parse(output)).toEqual(output);
  await expect(repository().detail({ ...detail, now: deadline })).resolves.toMatchObject({
    kind: "found",
    item: { isAvailable: true },
  });
});

test("[CUS-07:db] an active restaurant's temporary pause remains visible with its exact reopening", async () => {
  const { sql } = database.get();
  await sql`UPDATE merchants SET hours_paused_until = ${deadline.toISOString()} WHERE id = ${merchantId}`;
  try {
    await expect(repository().read({ slug, now })).resolves.toMatchObject({
      kind: "found",
      restaurant: {
        isOpen: false,
        nextOpensAt: deadline.toISOString(),
        pausedUntil: deadline.toISOString(),
      },
    });
  } finally {
    await sql`UPDATE merchants SET hours_paused_until = null WHERE id = ${merchantId}`;
  }
});

test("[CUS-08:db] photos require a current ready item attachment on a visible public item", async () => {
  const repo = repository();
  const photo = {
    merchantId,
    itemId: visible,
    mediaId: readyPhoto,
    format: "webp",
    width: 640,
  } as const;
  await expect(repo.readPhoto(photo)).resolves.toEqual({ key: `variants/${readyPhoto}/640.webp` });
  for (const query of [
    { ...photo, merchantId: id(11) },
    { ...photo, itemId: foreign },
    { ...photo, itemId: approved, mediaId: coverPhoto },
    { ...photo, itemId: soldOut, mediaId: pendingPhoto },
  ])
    await expect(repo.readPhoto(query)).resolves.toBeUndefined();

  const { sql } = database.get();
  await sql`UPDATE items SET photo_id = ${readyPhoto} WHERE id IN (${held}, ${rejected}, ${legacy}, ${archived}, ${approved})`;
  for (const itemId of [held, rejected, legacy, archived]) {
    await expect(repo.readPhoto({ ...photo, itemId })).resolves.toBeUndefined();
  }
  await expect(repo.readPhoto({ ...photo, itemId: approved })).resolves.toEqual({
    key: `variants/${readyPhoto}/640.webp`,
  });
  await sql`UPDATE items SET photo_id = ${pendingPhoto} WHERE id = ${visible}`;
  await expect(repo.readPhoto(photo)).resolves.toBeUndefined();
  await sql`UPDATE items SET photo_id = ${readyPhoto} WHERE id = ${visible}`;
  for (const status of ["approved", "paused", "suspended"] as const) {
    await sql`UPDATE merchants SET status = ${status} WHERE id = ${merchantId}`;
    await expect(repo.readPhoto(photo)).resolves.toBeUndefined();
  }
  await sql`UPDATE merchants SET status = 'active', is_demo = true WHERE id = ${merchantId}`;
  await expect(repo.readPhoto(photo)).resolves.toBeUndefined();
  await sql`UPDATE merchants SET is_demo = false WHERE id = ${merchantId}`;
});
