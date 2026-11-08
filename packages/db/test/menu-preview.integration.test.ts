import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMenuModerationRepository } from "../src/menu-moderation.ts";
import { createMenuPreviewRepository } from "../src/menu-preview.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T12:00:00.000Z");
const deadline = new Date(now.getTime() + 60_000);
const at = now.toISOString();
const fixtureId = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const managerId = fixtureId(3);
const staffId = fixtureId(4);
const otherOwnerId = fixtureId(5);
const adminId = fixtureId(6);
const merchantId = fixtureId(10);
const otherMerchantId = fixtureId(11);
const reviewMerchantId = fixtureId(12);
const categoryId = fixtureId(20);
const otherCategoryId = fixtureId(21);
const reviewCategoryId = fixtureId(22);
const alternateCategoryId = fixtureId(23);
const visible = fixtureId(30);
const held = fixtureId(31);
const rejected = fixtureId(32);
const archived = fixtureId(33);
const legacy = fixtureId(34);
const approved = fixtureId(80);
const soldOut = fixtureId(81);
const foreign = fixtureId(82);
const awaitingReview = fixtureId(83);
const differentCategory = fixtureId(84);
const readyPhoto = fixtureId(90);
const coverPhoto = fixtureId(91);
const pendingPhoto = fixtureId(92);
const firstGroup = fixtureId(101);
const secondGroup = fixtureId(100);
const firstOption = fixtureId(103);
const secondOption = fixtureId(102);
const thirdOption = fixtureId(104);

async function seedMerchants() {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'اختبار', 'Test') ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1698', 16, 'اختبار', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.765), 4326))
  `;
  for (const [index, id] of [ownerId, managerId, staffId, otherOwnerId, adminId].entries()) {
    await sql`
      INSERT INTO users (id, phone_e164, created_at)
      VALUES (${id}, ${"+21350000000" + String(index)}, ${at})
    `;
  }
  await sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${adminId}, ${Buffer.alloc(32)})`;
  for (const [id, owner, category, status] of [
    [merchantId, ownerId, categoryId, "paused"],
    [otherMerchantId, otherOwnerId, otherCategoryId, "active"],
    [reviewMerchantId, ownerId, reviewCategoryId, "approved"],
  ] as const) {
    await sql`
      INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
        location, cuisines, status, created_at, menu_revision)
      VALUES (${id}, ${`fixture-${id}`}, 'Restaurant fictif', 'Propriétaire de test', '+213500000000',
        ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.765), 4326), ARRAY['algerian'],
        ${status}, ${at}, 7)
    `;
    await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${id}, ${owner}, 'owner')`;
    await sql`
      INSERT INTO categories (id, merchant_id, names, sort)
      VALUES (${category}, ${id}, '{"fr":"Plats","ar":"أطباق"}', 0)
    `;
  }
  await sql`
    INSERT INTO merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${managerId}, 'manager'), (${merchantId}, ${staffId}, 'staff')
  `;
  await sql`
    INSERT INTO categories (id, merchant_id, names, sort)
    VALUES (${alternateCategoryId}, ${merchantId}, '{"fr":"Desserts"}', 1)
  `;
}

async function seedItems() {
  const { sql } = database.get();
  const photo = { accountId: ownerId, merchantId, now };
  await seedReadyPhoto(sql, { ...photo, mediaId: readyPhoto, kind: "item" });
  await seedReadyPhoto(sql, { ...photo, mediaId: coverPhoto, kind: "cover" });
  await sql`
    INSERT INTO media_uploads (id, owner_id, merchant_id, kind, content_type, bytes, created_at)
    VALUES (${pendingPhoto}, ${ownerId}, ${merchantId}, 'item', 'image/png', 16, ${at})
  `;
  const items = [
    [visible, "unreviewed", "Plat de test", merchantId, categoryId],
    [held, "blocked_pending_review", "Plat retenu", merchantId, categoryId],
    [rejected, "rejected", "Plat rejeté", merchantId, categoryId],
    [archived, "approved", "Plat archivé", merchantId, categoryId],
    [approved, "approved", "Cocktail sans alcool", merchantId, categoryId],
    [soldOut, "unreviewed", "Plat épuisé", merchantId, categoryId],
    [foreign, "approved", "Plat étranger", otherMerchantId, otherCategoryId],
    [
      awaitingReview,
      "blocked_pending_review",
      "Bière sans alcool",
      reviewMerchantId,
      reviewCategoryId,
    ],
    [differentCategory, "approved", "Dessert", merchantId, alternateCategoryId],
  ] as const;
  for (const [id, status, name, merchant, category] of items) {
    await sql`
      INSERT INTO items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
        prep_extra_min, moderation_status)
      VALUES (${id}, ${merchant}, ${category}, jsonb_build_object('fr', ${name}::text),
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
  await sql`UPDATE items SET archived_at = ${at} WHERE id = ${archived}`;
  await sql`UPDATE items SET photo_id = ${readyPhoto} WHERE id = ${visible}`;
  await sql`UPDATE items SET photo_id = ${coverPhoto} WHERE id = ${approved}`;
  await sql`UPDATE items SET photo_id = ${pendingPhoto}, is_available = false,
    sold_out_until = ${deadline.toISOString()} WHERE id = ${soldOut}`;
}

async function seedOptions() {
  await database.get().sql.begin(async (tx) => {
    await tx`
      INSERT INTO option_groups (id, merchant_id, names, minimum, maximum)
      VALUES (${firstGroup}, ${merchantId}, '{"fr":"Sauces"}', 1, 2),
        (${secondGroup}, ${merchantId}, '{"fr":"Garnitures"}', 0, 1)
    `;
    await tx`
      INSERT INTO options (id, merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
      VALUES (${secondOption}, ${merchantId}, ${firstGroup}, '{"fr":"Piment"}', 100, false, false, 1),
        (${firstOption}, ${merchantId}, ${firstGroup}, '{"fr":"Citron"}', 20, true, true, 0),
        (${thirdOption}, ${merchantId}, ${secondGroup}, '{"fr":"Olives"}', 150, false, true, 0)
    `;
    await tx`
      INSERT INTO item_option_groups (merchant_id, item_id, group_id, sort)
      VALUES (${merchantId}, ${soldOut}, ${secondGroup}, 1),
        (${merchantId}, ${soldOut}, ${firstGroup}, 0)
    `;
  });
}

beforeAll(async () => {
  await seedMerchants();
  await seedItems();
  await seedOptions();
});

const page = { accountId: ownerId, merchantId, categoryId, now, limit: 1 };
const detail = { accountId: managerId, merchantId, itemId: soldOut, expectedRevision: 7, now };
const repository = () => createMenuPreviewRepository(database.get());

test("[ADM-04:db] preview pages skip held, rejected, archived and unscreened prohibited text before pagination", async () => {
  const repo = repository();
  await expect(repo.list(page)).resolves.toEqual({
    kind: "listed",
    revision: 7,
    context: { restaurantName: "Restaurant fictif", categoryNames: { ar: "أطباق", fr: "Plats" } },
    items: [
      {
        itemId: visible,
        names: { fr: "Plat de test" },
        descriptions: { fr: "Description de test" },
        priceDzd: 1290,
        photoId: readyPhoto,
        tags: ["new"],
        isAvailable: true,
      },
    ],
    nextCursor: `7~${visible}`,
  });
  await expect(
    repo.list({ ...page, cursor: { itemId: visible, revision: 7 } }),
  ).resolves.toMatchObject({
    kind: "listed",
    items: [{ itemId: approved, photoId: null }],
    nextCursor: `7~${approved}`,
  });
  await expect(
    repo.list({ ...page, cursor: { itemId: approved, revision: 7 } }),
  ).resolves.toMatchObject({
    kind: "listed",
    items: [{ itemId: soldOut, photoId: null }],
    nextCursor: null,
  });
});

test("[ADM-04:db] hidden or out-of-scope items cannot anchor a cursor or return preview details", async () => {
  const repo = repository();
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

test("[MER-09:db] preview reads require owner or manager access to the target restaurant", async () => {
  const repo = repository();
  for (const accountId of [staffId, otherOwnerId]) {
    await expect(repo.list({ ...page, accountId })).resolves.toEqual({ kind: "not_found" });
    await expect(repo.detail({ ...detail, accountId })).resolves.toEqual({ kind: "not_found" });
  }
  await expect(repo.list({ ...page, categoryId: otherCategoryId })).resolves.toEqual({
    kind: "not_found",
  });
  await expect(repo.list({ ...page, accountId: managerId })).resolves.toMatchObject({
    kind: "listed",
  });
});

test("[MER-09:db] [MER-10:db] preview detail follows the sold-out deadline and stored option order", async () => {
  const repo = repository();
  const result = await repo.detail(detail);
  expect(result).toEqual({
    kind: "found",
    revision: 7,
    item: {
      itemId: soldOut,
      names: { fr: "Plat épuisé" },
      descriptions: { fr: "Description de test" },
      priceDzd: 1290,
      photoId: null,
      tags: ["new"],
      isAvailable: false,
    },
    optionGroups: [
      {
        optionGroupId: firstGroup,
        names: { fr: "Sauces" },
        minimum: 1,
        maximum: 2,
        options: [
          {
            optionId: firstOption,
            names: { fr: "Citron" },
            priceDeltaDzd: 20,
            isDefault: true,
            isAvailable: true,
          },
          {
            optionId: secondOption,
            names: { fr: "Piment" },
            priceDeltaDzd: 100,
            isDefault: false,
            isAvailable: false,
          },
        ],
      },
      {
        optionGroupId: secondGroup,
        names: { fr: "Garnitures" },
        minimum: 0,
        maximum: 1,
        options: [
          {
            optionId: thirdOption,
            names: { fr: "Olives" },
            priceDeltaDzd: 150,
            isDefault: false,
            isAvailable: true,
          },
        ],
      },
    ],
  });
  await expect(repo.detail({ ...detail, now: deadline })).resolves.toMatchObject({
    kind: "found",
    item: { isAvailable: true },
  });
  await expect(repo.detail({ ...detail, itemId: visible })).resolves.toMatchObject({
    kind: "found",
    item: { photoId: readyPhoto },
    optionGroups: [],
  });
});

test("[ADM-04:db] an audited false positive becomes visible at the new revision", async () => {
  const repo = repository();
  const reviewPage = { ...page, merchantId: reviewMerchantId, categoryId: reviewCategoryId };
  const reviewDetail = {
    ...detail,
    accountId: ownerId,
    merchantId: reviewMerchantId,
    itemId: awaitingReview,
  };
  await expect(repo.list(reviewPage)).resolves.toMatchObject({
    kind: "listed",
    items: [],
    nextCursor: null,
  });
  const hash = createHash("sha256").update("fixture-item-approval").digest();
  await expect(
    createMenuModerationRepository(database.get()).reviewItem({
      adminUserId: adminId,
      itemId: awaitingReview,
      decision: "approve",
      reason: "Sans alcool",
      now,
      idempotencyKeyHash: hash,
      requestHash: hash,
    }),
  ).resolves.toMatchObject({ kind: "reviewed", status: "approved" });
  await expect(repo.detail(reviewDetail)).resolves.toEqual({ kind: "revision_conflict" });
  await expect(repo.detail({ ...reviewDetail, expectedRevision: 8 })).resolves.toMatchObject({
    kind: "found",
    revision: 8,
    item: { itemId: awaitingReview },
  });
});
