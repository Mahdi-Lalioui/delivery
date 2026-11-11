import { configureCartLine } from "@zaafran/domain/cart";
import { beforeAll, expect, test } from "vitest";
import { createPublicRestaurantRepository } from "../src/public-restaurant.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

const database = registerTestDatabase();
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const merchantId = id(10);
const slug = "availability-fixture";
const repository = () => createPublicRestaurantRepository(database.get());

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'اختبار', 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${id(1)}, '1698', 16, 'اختبار', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.765), 4326))`;
  await sql`INSERT INTO users (id, phone_e164, created_at)
    VALUES (${id(2)}, '+213500000001', '2026-11-08T09:00:00Z')`;
  await sql`
    INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    VALUES (${merchantId}, ${slug}, 'Restaurant fictif', 'Propriétaire privé', '+213500000000',
      ${id(1)}, ST_SetSRID(ST_MakePoint(3.05, 36.765), 4326), ARRAY['algerian'], 'active',
      '2026-11-08T09:00:00Z')
  `;
  for (const [serial, from, to] of [
    [20, "10:00", "14:00"],
    [21, "18:00", "02:00"],
    [22, null, null],
  ] as const) {
    await sql`INSERT INTO categories (id, merchant_id, names, sort, available_from, available_to)
      VALUES (${id(serial)}, ${merchantId}, '{"fr":"Plats"}', ${serial}, ${from}, ${to})`;
    await sql`INSERT INTO items (id, merchant_id, category_id, names, descriptions, price_dzd,
      tags, prep_extra_min)
      VALUES (${id(serial + 10)}, ${merchantId}, ${id(serial)}, '{"fr":"Plat"}',
        '{"fr":"Description"}', 750, ARRAY[]::text[], 0)`;
  }
  await seedReadyPhoto(sql, {
    mediaId: id(90),
    kind: "item",
    merchantId,
    accountId: id(2),
    now: new Date("2026-11-08T09:00:00Z"),
  });
  await sql`UPDATE items SET photo_id = ${id(90)} WHERE id = ${id(30)}`;
});

test.each([
  [20, "2026-11-08T08:59:59.999Z", false],
  [20, "2026-11-08T09:00:00.000Z", true],
  [20, "2026-11-08T12:59:59.999Z", true],
  [20, "2026-11-08T13:00:00.000Z", false],
  [21, "2026-11-08T16:59:59.999Z", false],
  [21, "2026-11-08T17:00:00.000Z", true],
  [21, "2026-11-08T23:00:00.000Z", true],
  [21, "2026-11-09T00:59:59.999Z", true],
  [21, "2026-11-09T01:00:00.000Z", false],
  [22, "2026-11-08T13:00:00.000Z", true],
])(
  "[CUS-07:db] [CUS-08:db] category %i at %s is available=%s in list, detail and cart",
  async (serial, at, isAvailable) => {
    const now = new Date(at);
    const itemId = id(serial + 10);
    await expect(
      repository().list({ slug, categoryId: id(serial), now, limit: 50 }),
    ).resolves.toMatchObject({
      kind: "listed",
      items: [{ itemId, isAvailable }],
    });
    const result = await repository().detail({ slug, itemId, expectedRevision: 0, now });
    expect(result).toMatchObject({ kind: "found", item: { itemId, isAvailable } });
    if (result.kind !== "found") throw new Error("Missing availability fixture");
    const configured = configureCartLine({
      lineId: "fixture-line",
      item: { ...result.item, names: { fr: "Plat" } },
      optionGroups: [],
      selections: [],
      quantity: 1,
      note: "",
    });
    if (isAvailable) expect(configured.ok).toBe(true);
    else expect(configured).toEqual({ ok: false, error: { code: "item_unavailable" } });
  },
);

test("[CUS-08:db] item sold-out state remains required even inside its category window", async () => {
  const { sql } = database.get();
  const itemId = id(30);
  await sql`UPDATE items SET is_available = false, sold_out_until = '2026-11-08T10:00:00Z'
    WHERE id = ${itemId}`;
  try {
    for (const [at, isAvailable] of [
      ["2026-11-08T09:30:00Z", false],
      ["2026-11-08T10:00:00Z", true],
      ["2026-11-08T13:00:00Z", false],
    ] as const) {
      await expect(
        repository().detail({ slug, itemId, expectedRevision: 0, now: new Date(at) }),
      ).resolves.toMatchObject({ kind: "found", item: { isAvailable } });
    }
  } finally {
    await sql`UPDATE items SET is_available = true, sold_out_until = null WHERE id = ${itemId}`;
  }
});

test("[ADM-04:db] attached option and group text withholds the whole item even after item approval", async () => {
  const { sql } = database.get();
  const now = new Date("2026-11-08T09:30:00Z");
  const itemId = id(30);
  const optionGroupId = id(100);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO option_groups (id, merchant_id, names, minimum, maximum)
      VALUES (${optionGroupId}, ${merchantId}, '{"fr":"Sauces"}', 1, 1)`;
    await tx`INSERT INTO options (id, merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
      VALUES (${id(101)}, ${merchantId}, ${optionGroupId}, '{"fr":"Vodka"}', 50, false, false, 0)`;
    await tx`INSERT INTO item_option_groups (merchant_id, item_id, group_id, sort)
      VALUES (${merchantId}, ${itemId}, ${optionGroupId}, 0)`;
  });
  const repo = repository();
  async function expectHidden() {
    await expect(repo.list({ slug, categoryId: id(20), limit: 50, now })).resolves.toMatchObject({
      kind: "listed",
      items: [],
      nextCursor: null,
    });
    await expect(repo.detail({ slug, itemId, expectedRevision: 0, now })).resolves.toEqual({
      kind: "not_found",
    });
    await expect(
      repo.readPhoto({ merchantId, itemId, mediaId: id(90), format: "webp", width: 640 }),
    ).resolves.toBeUndefined();
  }
  await expectHidden();
  await sql`UPDATE items SET moderation_status = 'approved' WHERE id = ${itemId}`;
  await expectHidden();
  await sql`UPDATE options SET names = '{"fr":"Citron"}' WHERE id = ${id(101)}`;
  await expect(repo.detail({ slug, itemId, expectedRevision: 0, now })).resolves.toMatchObject({
    kind: "found",
  });
  await sql`UPDATE option_groups SET names = '{"ar":"فودكا"}' WHERE id = ${optionGroupId}`;
  await expectHidden();
});
