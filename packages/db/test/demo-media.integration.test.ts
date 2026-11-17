import { createHash } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import {
  acceptDemoCrop,
  attachDemoItemPhoto,
  insertDemoPhotoUpload,
  listDemoItemsWithoutPhoto,
} from "../src/demo-media.ts";
import { seedDemoMerchants } from "../src/demo-merchants.ts";
import { seedGeography } from "../src/geography.ts";
import { createMediaProcessingRepository } from "../src/media-processing.ts";
import type { PublishedVariant } from "../src/media-processing.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-17T09:00:00.000Z");
const thumbhash = "1QcSHQRnh493V4dIh4eXh1h4kJUI";
let serial = 0;

beforeEach(async () => {
  const connection = database.get();
  await connection.sql`TRUNCATE public.merchants, public.users CASCADE`;
  await seedGeography(connection);
  await seedDemoMerchants(connection);
});

async function firstDemoItem() {
  const [item] = await listDemoItemsWithoutPhoto(database.get());
  if (!item) throw new Error("Expected the demo seed to create dishes");
  return item;
}

async function upload(merchantId: string) {
  serial += 1;
  const key = `quarantine/demo/${serial.toString()}`;
  const digest = createHash("sha256").update(key).digest();
  return insertDemoPhotoUpload(database.get(), {
    merchantId,
    quarantineKey: key,
    bytes: 2048,
    digest,
    now,
  });
}

async function awaitingCrop(merchantId: string) {
  const mediaId = await upload(merchantId);
  const previewKey = `private/${mediaId}/preview.webp`;
  const processing = createMediaProcessingRepository(database.get());
  await processing.recordPreview({ mediaId, previewKey, width: 1280, height: 960 });
  return mediaId;
}

function variantsFor(mediaId: string): PublishedVariant[] {
  return (["avif", "webp"] as const).flatMap((format) =>
    ([160, 320, 640, 960, 1280] as const).map((width) => ({
      format,
      width,
      height: (width * 3) / 4,
      bytes: 100 + width,
      storageKey: `media/${mediaId}/${width.toString()}.${format}`,
    })),
  );
}

async function published(merchantId: string) {
  const mediaId = await awaitingCrop(merchantId);
  await acceptDemoCrop(database.get(), mediaId);
  const processing = createMediaProcessingRepository(database.get());
  await processing.publish({ mediaId, thumbhash, variants: variantsFor(mediaId) });
  return mediaId;
}

async function uploadRow(mediaId: string) {
  const [row] = await database.get().sql<
    {
      kind: string;
      status: string;
      contentType: string;
      merchantId: string;
      phone: string;
      crop: number[] | null;
    }[]
  >`
    SELECT upload.kind, upload.status, upload.content_type AS "contentType",
      upload.merchant_id AS "merchantId", owner.phone_e164 AS phone,
      CASE WHEN upload.crop_zoom_percent IS NULL THEN NULL
        ELSE ARRAY[upload.crop_focal_x, upload.crop_focal_y, upload.crop_zoom_percent] END AS crop
    FROM public.media_uploads AS upload
    JOIN public.users AS owner ON owner.id = upload.owner_id
    WHERE upload.id = ${mediaId}
  `;
  return row;
}

test("lists the photo-less dishes of demo restaurants only, with the first cuisine", async () => {
  const { sql } = database.get();
  const all = await listDemoItemsWithoutPhoto(database.get());
  expect(all.length).toBeGreaterThanOrEqual(60);
  const [first] = all;
  expect(first?.names.ar).toMatch(/\p{Script=Arabic}/u);
  expect(first?.names.fr).toMatch(/[a-z]/i);
  const [merchant] = await sql<{ cuisines: string[] }[]>`
    SELECT cuisines FROM public.merchants WHERE id = ${first?.merchantId ?? null}
  `;
  expect(first?.cuisine).toBe(merchant?.cuisines[0]);

  await sql`UPDATE public.merchants SET is_demo = false WHERE id = ${first?.merchantId ?? null}`;
  const demoOnly = await listDemoItemsWithoutPhoto(database.get());
  expect(demoOnly.some(({ merchantId }) => merchantId === first?.merchantId)).toBe(false);
  expect(demoOnly.length).toBeLessThan(all.length);
});

test("a demo upload is a preparing item photo owned by one seed-only uploader", async () => {
  const item = await firstDemoItem();
  const firstId = await upload(item.merchantId);
  const secondId = await upload(item.merchantId);

  expect(await uploadRow(firstId)).toEqual({
    kind: "item",
    status: "preparing",
    contentType: "image/png",
    merchantId: item.merchantId,
    phone: "+213550999900",
    crop: null,
  });
  const [{ uploaders } = { uploaders: -1 }] = await database.get().sql<{ uploaders: number }[]>`
    SELECT count(DISTINCT owner_id)::int AS uploaders FROM public.media_uploads
    WHERE id IN (${firstId}, ${secondId})
  `;
  expect(uploaders).toBe(1);

  const { sql } = database.get();
  await sql`UPDATE public.merchants SET is_demo = false WHERE id = ${item.merchantId}`;
  await expect(upload(item.merchantId)).rejects.toThrow(/demo restaurants only/);
});

test("the demo crop is centred and applies only while the upload awaits its crop", async () => {
  const item = await firstDemoItem();
  const preparingId = await upload(item.merchantId);
  expect(await acceptDemoCrop(database.get(), preparingId)).toBe(false);
  expect(await uploadRow(preparingId)).toMatchObject({ status: "preparing", crop: null });

  const mediaId = await awaitingCrop(item.merchantId);
  expect(await acceptDemoCrop(database.get(), mediaId)).toBe(true);
  expect(await uploadRow(mediaId)).toMatchObject({
    status: "processing",
    crop: [5000, 5000, 100],
  });
  expect(await acceptDemoCrop(database.get(), mediaId)).toBe(false);
});

test("a published demo photo is linked to its dish once, and only to a demo dish", async () => {
  const item = await firstDemoItem();
  const pendingId = await awaitingCrop(item.merchantId);
  expect(
    await attachDemoItemPhoto(database.get(), { itemId: item.itemId, mediaId: pendingId }),
  ).toBe(false);

  const mediaId = await published(item.merchantId);
  expect(await attachDemoItemPhoto(database.get(), { itemId: item.itemId, mediaId })).toBe(true);
  const remaining = await listDemoItemsWithoutPhoto(database.get());
  expect(remaining.some(({ itemId }) => itemId === item.itemId)).toBe(false);

  const otherId = await published(item.merchantId);
  expect(await attachDemoItemPhoto(database.get(), { itemId: item.itemId, mediaId: otherId })).toBe(
    false,
  );

  const [next] = remaining;
  if (!next) throw new Error("Expected more demo dishes");
  const foreignId = await published(next.merchantId);
  const { sql } = database.get();
  await sql`UPDATE public.merchants SET is_demo = false WHERE id = ${next.merchantId}`;
  expect(
    await attachDemoItemPhoto(database.get(), { itemId: next.itemId, mediaId: foreignId }),
  ).toBe(false);
});
