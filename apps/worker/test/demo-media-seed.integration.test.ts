import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { createLocalMediaStore } from "@zaafran/media";
import type { MediaStore } from "@zaafran/media";
import sharp from "sharp";
import { afterAll, beforeAll, expect, test } from "vitest";
import { seedDemoMerchants } from "../../../packages/db/src/demo-merchants.ts";
import { seedGeography } from "../../../packages/db/src/geography.ts";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { seedDemoMedia } from "../src/demo-media-seed.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-17T09:00:00.000Z");
let root = "";
let store: MediaStore;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zaafran-demo-media-"));
  store = createLocalMediaStore({ root });
  const connection = database.get();
  await seedGeography(connection);
  await seedDemoMerchants(connection);
  // Two dishes keep the encode time small; archived dishes are not listed for photos.
  await connection.sql`
    UPDATE public.items SET archived_at = ${now.toISOString()}
    WHERE id NOT IN (SELECT id FROM public.items ORDER BY id LIMIT 2)
  `;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const options = () => ({ database: database.get(), store, maxPixels: 50_000_000, now });

async function photos() {
  return database.get().sql<
    { itemId: string; status: string; thumbhash: string; keys: string[]; quarantine: string }[]
  >`
    SELECT item.id AS "itemId", media.status, media.thumbhash,
      media.quarantine_key AS quarantine,
      (SELECT array_agg(variant.storage_key ORDER BY variant.storage_key)
        FROM public.media_variants AS variant WHERE variant.media_id = media.id) AS keys
    FROM public.items AS item
    JOIN public.media_uploads AS media ON media.id = item.photo_media_id
    ORDER BY item.id
  `;
}

test("publishes a generated photo for every demo dish through the media pipeline", async () => {
  expect(await seedDemoMedia(options())).toBe(2);

  const published = await photos();
  expect(published).toHaveLength(2);
  for (const photo of published) {
    expect(photo.status).toBe("ready");
    expect(photo.thumbhash).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(photo.keys).toHaveLength(10);
    for (const key of photo.keys) expect(key).toMatch(/^media\/[0-9a-f-]+\/\d+\.(avif|webp)$/);
    const largest = photo.keys.find((key) => key.endsWith("/1280.webp")) ?? "";
    const object = await store.get(largest);
    if (!object) throw new Error("Expected the published 1280 variant in the store");
    const bytes = Buffer.concat(await object.body.toArray());
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 1280, height: 960 });
    // The quarantined original is removed once the photo is published.
    const original = await store.get(photo.quarantine);
    if (original) await text(original.body);
    expect(original).toBeUndefined();
  }
});

test("a second seed finds nothing left to draw", async () => {
  const before = await photos();
  expect(await seedDemoMedia(options())).toBe(0);
  expect(await photos()).toEqual(before);
});
