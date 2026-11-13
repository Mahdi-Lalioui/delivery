import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { createLocalMediaStore } from "@zaafran/media";
import type { MediaStore } from "@zaafran/media";
import sharp from "sharp";
import { afterAll, beforeAll, expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { createMediaProcessor } from "../src/media-process.ts";

const database = registerTestDatabase();
const now = "2026-11-13T06:00:00.000Z";
const ownerId = "01932f18-3150-7c33-8a7a-000000000001";
let root = "";
let store: MediaStore;
let serial = 0;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zaafran-media-process-"));
  store = createLocalMediaStore({ root });
  const { sql } = database.get();
  await sql`INSERT INTO public.users (id, phone_e164, created_at) VALUES (${ownerId}, '+213500000001', ${now})`;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const png = (width = 192, height = 108) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 90 } } })
    .png()
    .toBuffer();

async function put(target: MediaStore, key: string, data: Buffer) {
  const checksumSha256 = createHash("sha256").update(data).digest("base64");
  await target.put({ key, body: Readable.from([data]), bytes: data.length, checksumSha256 });
}

async function exists(key: string) {
  const object = await store.get(key);
  if (object) await text(object.body);
  return object !== undefined;
}

async function upload(
  data: Buffer,
  contentType: "image/png" | "image/jpeg" | "image/heic" = "image/png",
) {
  serial += 1;
  const quarantineKey = `quarantine/fixture-${serial.toString()}`;
  await put(store, quarantineKey, data);
  const digest = createHash("sha256").update(data).digest();
  const { sql } = database.get();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.media_uploads (owner_id, kind, content_type, bytes, status, quarantine_key,
      content_digest, created_at, adopted_at)
    VALUES (${ownerId}, 'application', ${contentType}, ${data.length}, 'preparing',
      ${quarantineKey}, ${digest}, ${now}, ${now})
    RETURNING id
  `;
  if (!row) throw new Error("Expected the fixture upload to be inserted");
  return { mediaId: row.id, quarantineKey };
}

async function chooseCrop(mediaId: string) {
  const { sql } = database.get();
  await sql`
    UPDATE public.media_uploads
    SET status = 'processing', crop_focal_x = 5000, crop_focal_y = 5000, crop_zoom_percent = 100
    WHERE id = ${mediaId}
  `;
}

async function row(mediaId: string) {
  const { sql } = database.get();
  const [found] = await sql<
    {
      status: string;
      previewKey: string | null;
      previewWidth: number | null;
      reason: string | null;
    }[]
  >`
    SELECT status, preview_key AS "previewKey", preview_width AS "previewWidth",
      rejection_reason AS reason
    FROM public.media_uploads WHERE id = ${mediaId}
  `;
  return found;
}

const processor = (target: MediaStore = store, maxPixels = 1_000_000) =>
  createMediaProcessor({ database: database.get(), store: target, maxPixels });

test("[MER-14:worker] preparing stores a private preview and waits for the crop", async () => {
  const { mediaId, quarantineKey } = await upload(await png());
  await processor()({ mediaId, phase: "prepare" });
  await processor()({ mediaId, phase: "prepare" });

  const prepared = await row(mediaId);
  expect(prepared).toMatchObject({ status: "awaiting_crop", previewWidth: 192, reason: null });
  if (!prepared?.previewKey) throw new Error("Expected a preview key");
  expect(prepared.previewKey).toBe(`private/${mediaId}/preview.webp`);
  const preview = await store.get(prepared.previewKey);
  if (!preview) throw new Error("Expected the preview in the store");
  const metadata = await sharp(Buffer.concat(await preview.body.toArray())).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 192, height: 108 });
  expect(await exists(quarantineKey)).toBe(true);
});

test("[MER-14:worker] a mismatched, oversized or corrupt original is rejected and deleted", async () => {
  const mismatched = await upload(await png(), "image/jpeg");
  const oversized = await upload(await png(400, 300));
  const corrupt = await upload(Buffer.from("not an image"));

  await processor()({ mediaId: mismatched.mediaId, phase: "prepare" });
  await processor(store, 100_000)({ mediaId: oversized.mediaId, phase: "prepare" });
  await processor()({ mediaId: corrupt.mediaId, phase: "prepare" });

  expect(await row(mismatched.mediaId)).toMatchObject({
    status: "rejected",
    reason: "content_type_mismatch",
  });
  expect(await row(oversized.mediaId)).toMatchObject({
    status: "rejected",
    reason: "image_too_large",
  });
  expect(await row(corrupt.mediaId)).toMatchObject({ status: "rejected", reason: "invalid_image" });
  for (const { quarantineKey } of [mismatched, oversized, corrupt]) {
    expect(await exists(quarantineKey)).toBe(false);
  }
});

test("[MER-14:worker] publishing stores every variant before ready and deletes the original", async () => {
  const { mediaId, quarantineKey } = await upload(await png());
  await processor()({ mediaId, phase: "prepare" });
  await chooseCrop(mediaId);

  await processor()({ mediaId, phase: "publish" });
  await processor()({ mediaId, phase: "publish" });

  expect(await row(mediaId)).toMatchObject({ status: "ready" });
  const { sql } = database.get();
  const variants = await sql<{ storageKey: string; width: number; height: number }[]>`
    SELECT storage_key AS "storageKey", width, height FROM public.media_variants
    WHERE media_id = ${mediaId} ORDER BY format, width
  `;
  expect(variants).toHaveLength(10);
  for (const variant of variants) {
    expect(variant.height * 16).toBe(variant.width * 9);
    expect(variant.storageKey.startsWith(`private/${mediaId}/`)).toBe(true);
    expect(await exists(variant.storageKey)).toBe(true);
  }
  expect(await exists(quarantineKey)).toBe(false);
});

test("[MER-14:worker] a publish interrupted mid-way recovers on retry", async () => {
  const { mediaId, quarantineKey } = await upload(await png());
  await processor()({ mediaId, phase: "prepare" });
  await chooseCrop(mediaId);

  let puts = 0;
  const failing: MediaStore = {
    get: (key) => store.get(key),
    delete: (key) => store.delete(key),
    put: async (input) => {
      puts += 1;
      if (puts === 4) throw new Error("Simulated worker interruption");
      return store.put(input);
    },
  };
  await expect(processor(failing)({ mediaId, phase: "publish" })).rejects.toThrow(
    "Simulated worker interruption",
  );
  expect(await row(mediaId)).toMatchObject({ status: "processing" });
  expect(await exists(quarantineKey)).toBe(true);

  await processor()({ mediaId, phase: "publish" });
  expect(await row(mediaId)).toMatchObject({ status: "ready" });
});

test("[MER-14:worker] HEIC waits for the bounded decoder instead of being rejected", async () => {
  const { mediaId, quarantineKey } = await upload(await png(), "image/heic");
  await expect(processor()({ mediaId, phase: "prepare" })).rejects.toThrow(/HEIC/u);
  expect(await row(mediaId)).toMatchObject({ status: "preparing" });
  expect(await exists(quarantineKey)).toBe(true);
});

test("[MER-14:worker] a retry after settling still deletes the original", async () => {
  const original = await png();
  const { mediaId, quarantineKey } = await upload(original);
  await processor()({ mediaId, phase: "prepare" });
  await chooseCrop(mediaId);
  await processor()({ mediaId, phase: "publish" });

  await put(store, quarantineKey, original);
  await processor()({ mediaId, phase: "publish" });
  expect(await exists(quarantineKey)).toBe(false);
});
