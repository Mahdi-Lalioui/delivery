import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMenuItemRepository } from "../src/menu-item.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-13T07:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7c-${String(serial).padStart(12, "0")}`;
}

const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const otherOwnerId = fixtureId(3);
const merchantId = fixtureId(10);
const otherMerchantId = fixtureId(11);
const categoryId = fixtureId(20);
let mediaSerial = 0;

const digest = (value: string) => createHash("sha256").update(value).digest();

async function insertMerchant(id: string, owner: string) {
  const { sql } = database.get();
  await sql`
    insert into merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    values (${id}, ${`fixture-photo-${id}`}, 'Restaurant fictif de test', 'Propriétaire de test',
      '+213500000002', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
      array['algerian'], 'approved', ${now.toISOString()}::timestamptz)
  `;
  await sql`insert into merchant_members (merchant_id, user_id, role) values (${id}, ${owner}, 'owner')`;
}

interface PhotoSeed {
  readonly merchant?: string;
  readonly owner?: string;
  readonly kind?: "item" | "cover";
  readonly status?: "ready" | "processing";
}

async function insertPhoto(seed: PhotoSeed = {}) {
  mediaSerial += 1;
  const serial = mediaSerial.toString();
  const { merchant = merchantId, owner = ownerId, kind = "item", status = "ready" } = seed;
  const thumbhash = status === "ready" ? "1QcSHQRnh493V4dIh4eXh1h4kJUI" : null;
  const { sql } = database.get();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.media_uploads (owner_id, merchant_id, kind, content_type, bytes, status,
      quarantine_key, content_digest, created_at, adopted_at, preview_key, preview_width,
      preview_height, crop_focal_x, crop_focal_y, crop_zoom_percent, thumbhash)
    VALUES (${owner}, ${merchant}, ${kind}, 'image/png', 16, ${status}, ${`quarantine/${serial}`},
      ${digest(serial)}, ${now.toISOString()}, ${now.toISOString()}, ${`preview/${serial}.webp`},
      1280, 960, 5000, 5000, 100, ${thumbhash})
    RETURNING id
  `;
  if (!row) throw new Error("Expected the fixture photo to be inserted");
  return row.id;
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1697', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  await sql`
    insert into users (id, phone_e164, created_at) values
      (${ownerId}, '+213500000022', ${now.toISOString()}::timestamptz),
      (${otherOwnerId}, '+213500000023', ${now.toISOString()}::timestamptz)
  `;
  await insertMerchant(merchantId, ownerId);
  await insertMerchant(otherMerchantId, otherOwnerId);
  await sql`
    insert into categories (id, merchant_id, names, sort)
    values (${categoryId}, ${merchantId}, '{"fr":"Plats"}'::jsonb, 0)
  `;
});

function command<Input, Target extends { merchantId: string; itemId?: string }>(
  target: Target,
  key: string,
  input: Input,
) {
  return {
    ...target,
    accountId: ownerId,
    now,
    input,
    idempotencyKeyHash: digest(key),
    requestHash: digest(JSON.stringify({ target, input })),
  };
}

function itemInput(photoId: string | null, expectedRevision: number) {
  return {
    categoryId,
    names: { fr: "Plat fictif" },
    descriptions: { fr: "Description fictive" },
    priceDzd: 900,
    photoId,
    tags: [],
    extraPrepMinutes: 0,
    optionGroupIds: [],
    expectedRevision,
  };
}

test("[MER-14:db] an item only takes a ready item photo of its own restaurant", async () => {
  const repo = createMenuItemRepository(database.get());
  const target = { merchantId };
  const refused = [
    await insertPhoto({ merchant: otherMerchantId, owner: otherOwnerId }),
    await insertPhoto({ status: "processing" }),
    await insertPhoto({ kind: "cover" }),
    fixtureId(99),
  ];
  for (const [index, photoId] of refused.entries()) {
    expect(
      await repo.create(command(target, `refused-${index.toString()}`, itemInput(photoId, 0))),
    ).toEqual({ kind: "photos_unavailable" });
  }

  const photoId = await insertPhoto();
  const created = await repo.create(command(target, "create", itemInput(photoId, 0)));
  expect(created).toMatchObject({ kind: "applied", revision: 1, item: { photoId } });
  if (created.kind !== "applied") throw new Error("Expected item creation.");

  const listed = await repo.list({ merchantId, categoryId, accountId: ownerId, limit: 10, now });
  expect(listed).toMatchObject({ kind: "listed", items: [{ photoId }] });
});

test("[MER-14:db] edits replace or clear the photo, refuse foreign ones and duplicates keep it", async () => {
  const repo = createMenuItemRepository(database.get());
  const first = await insertPhoto();
  const created = await repo.create(command({ merchantId }, "edit-create", itemInput(first, 1)));
  if (created.kind !== "applied") throw new Error("Expected item creation.");
  const target = { merchantId, itemId: created.item.itemId };

  const foreign = await insertPhoto({ merchant: otherMerchantId, owner: otherOwnerId });
  expect(await repo.update(command(target, "edit-foreign", itemInput(foreign, 2)))).toEqual({
    kind: "photos_unavailable",
  });

  const second = await insertPhoto();
  const replaced = await repo.update(command(target, "edit-replace", itemInput(second, 2)));
  expect(replaced).toMatchObject({ kind: "applied", revision: 3, item: { photoId: second } });

  const duplicated = await repo.duplicate(
    command(target, "edit-duplicate", { expectedRevision: 3 }),
  );
  expect(duplicated).toMatchObject({ kind: "applied", item: { photoId: second } });

  const cleared = await repo.update(command(target, "edit-clear", itemInput(null, 4)));
  expect(cleared).toMatchObject({ kind: "applied", revision: 5, item: { photoId: null } });
});

test("[MER-14:db] the schema rejects a photo from another restaurant even outside the command", async () => {
  const { sql } = database.get();
  const foreign = await insertPhoto({ merchant: otherMerchantId, owner: otherOwnerId });
  await expect(sql`
    insert into items (merchant_id, category_id, names, descriptions, price_dzd, tags,
      prep_extra_min, photo_media_id)
    values (${merchantId}, ${categoryId}, '{"fr":"Direct"}', '{"fr":"Fictive"}', 100, '{}', 0, ${foreign})
  `).rejects.toMatchObject({ code: "23503" });
});
