import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMenuPreviewRepository } from "../src/menu-preview.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T12:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7b-${String(serial).padStart(12, "0")}`;
}

const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const staffId = fixtureId(3);
const otherOwnerId = fixtureId(4);
const merchantId = fixtureId(10);
const otherMerchantId = fixtureId(11);
const mainsId = fixtureId(20);
const drinksId = fixtureId(21);
const emptyId = fixtureId(22);
const otherCategoryId = fixtureId(23);
const listed = fixtureId(30);
const reviewed = fixtureId(31);
const held = fixtureId(32);
const rejected = fixtureId(33);
const archived = fixtureId(34);
const soldOut = fixtureId(35);
const otherItem = fixtureId(36);

async function insertMerchant(id: string, slug: string, owner: string) {
  const { sql } = database.get();
  await sql`
    insert into merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    values (${id}, ${slug}, ${"Restaurant fictif " + slug}, 'Propriétaire de test',
      '+213500000002', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
      array['algerian'], 'approved', ${now.toISOString()}::timestamptz)
  `;
  await sql`insert into merchant_members (merchant_id, user_id, role) values (${id}, ${owner}, 'owner')`;
}

interface ItemSeed {
  readonly id: string;
  readonly merchant?: string;
  readonly category: string;
  readonly name: string;
  readonly status?: string;
  readonly archivedAt?: string | null;
  readonly soldOutUntil?: string | null;
}

async function insertItem(seed: ItemSeed) {
  const { sql } = database.get();
  const { id, category, name, status = "unreviewed" } = seed;
  const soldOutUntil = seed.soldOutUntil ?? null;
  await sql`
    insert into items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
      prep_extra_min, moderation_status, archived_at, is_available, sold_out_until)
    values (${id}, ${seed.merchant ?? merchantId}, ${category}, ${JSON.stringify({ fr: name })}::jsonb,
      '{"ar":"وصف تجريبي"}', 450, '{spicy}'::text[], 0, ${status},
      ${seed.archivedAt ?? null}::timestamptz, ${soldOutUntil === null}, ${soldOutUntil}::timestamptz)
  `;
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1699', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  await sql`
    insert into users (id, phone_e164, created_at) values
      (${ownerId}, '+213500000012', ${now.toISOString()}::timestamptz),
      (${staffId}, '+213500000013', ${now.toISOString()}::timestamptz),
      (${otherOwnerId}, '+213500000014', ${now.toISOString()}::timestamptz)
  `;
  await insertMerchant(merchantId, "fixture-preview-a", ownerId);
  await insertMerchant(otherMerchantId, "fixture-preview-b", otherOwnerId);
  await sql`insert into merchant_members (merchant_id, user_id, role) values (${merchantId}, ${staffId}, 'staff')`;
  await sql`
    insert into categories (id, merchant_id, names, sort) values
      (${drinksId}, ${merchantId}, '{"fr":"Boissons"}', 1),
      (${mainsId}, ${merchantId}, '{"fr":"Plats"}', 0),
      (${emptyId}, ${merchantId}, '{"fr":"Vide"}', 2),
      (${otherCategoryId}, ${otherMerchantId}, '{"fr":"Autre"}', 0)
  `;
  await insertItem({ id: listed, category: mainsId, name: "Couscous" });
  await insertItem({
    id: reviewed,
    category: drinksId,
    name: "Bière sans alcool",
    status: "approved",
  });
  await insertItem({
    id: held,
    category: drinksId,
    name: "Bière",
    status: "blocked_pending_review",
  });
  await insertItem({ id: rejected, category: drinksId, name: "Vin", status: "rejected" });
  await insertItem({
    id: archived,
    category: emptyId,
    name: "Ancien",
    archivedAt: now.toISOString(),
  });
  await insertItem({
    id: soldOut,
    category: mainsId,
    name: "Chorba",
    soldOutUntil: "2026-11-08T23:00:00.000Z",
  });
  await insertItem({
    id: otherItem,
    merchant: otherMerchantId,
    category: otherCategoryId,
    name: "Pizza",
  });
});

test("[ADM-04:preview] the customer preview lists only active, listable items by category", async () => {
  const repo = createMenuPreviewRepository(database.get());
  const preview = await repo.read({ accountId: ownerId, merchantId, now });

  expect(preview).toEqual({
    kind: "previewed",
    revision: 0,
    restaurantName: "Restaurant fictif fixture-preview-a",
    categories: [
      {
        categoryId: mainsId,
        names: { fr: "Plats" },
        items: [
          expect.objectContaining({ itemId: listed, isAvailable: true, soldOutUntil: null }),
          expect.objectContaining({
            itemId: soldOut,
            isAvailable: false,
            soldOutUntil: "2026-11-08T23:00:00.000Z",
          }),
        ],
      },
      {
        categoryId: drinksId,
        names: { fr: "Boissons" },
        items: [
          {
            itemId: reviewed,
            names: { fr: "Bière sans alcool" },
            descriptions: { ar: "وصف تجريبي" },
            priceDzd: 450,
            tags: ["spicy"],
            isAvailable: true,
            soldOutUntil: null,
            photo: null,
          },
        ],
      },
    ],
  });
});

test("[ADM-04:preview] blocked, rejected and archived items never appear in the preview", async () => {
  const repo = createMenuPreviewRepository(database.get());
  const preview = await repo.read({ accountId: ownerId, merchantId, now });
  const ids = preview.kind === "previewed" ? preview.categories.flatMap((c) => c.items) : [];
  const shown = ids.map((item) => item.itemId);

  expect(shown).not.toContain(held);
  expect(shown).not.toContain(rejected);
  expect(shown).not.toContain(archived);
  expect(shown).not.toContain(otherItem);
});

test("[ADM-04:preview] only the merchant's own owners and managers can read the preview", async () => {
  const repo = createMenuPreviewRepository(database.get());

  expect(await repo.read({ accountId: staffId, merchantId, now })).toEqual({ kind: "not_found" });
  expect(await repo.read({ accountId: otherOwnerId, merchantId, now })).toEqual({
    kind: "not_found",
  });
  const own = await repo.read({ accountId: otherOwnerId, merchantId: otherMerchantId, now });
  expect(own).toMatchObject({ kind: "previewed", categories: [{ categoryId: otherCategoryId }] });
});

async function insertItemPhoto(merchant: string, owner: string, status: "ready" | "processing") {
  const { sql } = database.get();
  const ready = status === "ready";
  const [photo] = await sql<{ id: string }[]>`
    insert into media_uploads (owner_id, merchant_id, kind, content_type, bytes, status,
      quarantine_key, content_digest, created_at, adopted_at, preview_key, preview_width,
      preview_height, crop_focal_x, crop_focal_y, crop_zoom_percent, thumbhash)
    values (${owner}, ${merchant}, 'item', 'image/png', 16, ${status},
      ${"quarantine/" + status}, ${createHash("sha256").update(status).digest()},
      ${now.toISOString()}, ${now.toISOString()}, ${"preview/" + status}, 1280, 960, 5000, 5000,
      100, ${ready ? "1QcSHQRnh493V4dIh4eXh1h4kJUI" : null})
    returning id
  `;
  if (!photo) throw new Error("Expected the fixture photo to be inserted");
  if (!ready) return photo.id;
  for (const format of ["webp", "avif"]) {
    for (const width of [1280, 160, 640, 320, 960]) {
      const key = `media/${photo.id}/${width.toString()}.${format}`;
      await sql`
        insert into media_variants (media_id, format, width, height, bytes, storage_key)
        values (${photo.id}, ${format}, ${width}, ${(width * 3) / 4}, 100, ${key})
      `;
    }
  }
  return photo.id;
}

test("[MER-14:preview] a listed item shows its published photo variants and ThumbHash", async () => {
  const { sql } = database.get();
  const photoId = await insertItemPhoto(merchantId, ownerId, "ready");
  await sql`update items set photo_media_id = ${photoId} where id = ${listed}`;
  const repo = createMenuPreviewRepository(database.get());
  const preview = await repo.read({ accountId: ownerId, merchantId, now });
  const items = preview.kind === "previewed" ? preview.categories.flatMap((c) => c.items) : [];

  const shown = items.find((item) => item.itemId === listed);
  const variants = ["avif", "webp"].flatMap((format) =>
    [160, 320, 640, 960, 1280].map((width) => ({
      format,
      width,
      height: (width * 3) / 4,
      bytes: 100,
      url: `/media/${photoId}/${width.toString()}.${format}`,
    })),
  );
  expect(shown?.photo).toEqual({ thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI", variants });
  expect(items.find((item) => item.itemId === soldOut)?.photo).toBeNull();
});

test("[MER-14:preview] a photo that is not ready yet is never shown", async () => {
  const { sql } = database.get();
  const photoId = await insertItemPhoto(merchantId, ownerId, "processing");
  await sql`update items set photo_media_id = ${photoId} where id = ${soldOut}`;
  const repo = createMenuPreviewRepository(database.get());
  const preview = await repo.read({ accountId: ownerId, merchantId, now });
  const items = preview.kind === "previewed" ? preview.categories.flatMap((c) => c.items) : [];

  expect(items.find((item) => item.itemId === soldOut)?.photo).toBeNull();
});
