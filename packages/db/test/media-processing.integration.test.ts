import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMediaProcessingRepository } from "../src/media-processing.ts";
import type { PublishedVariant } from "../src/media-processing.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = "2026-11-13T06:00:00.000Z";
const ownerId = "01932f18-3150-7c33-8a7a-000000000001";
const thumbhash = "1QcSHQRnh493V4dIh4eXh1h4kJUI";
let serial = 0;

const repo = () => createMediaProcessingRepository(database.get());
const digest = (value: string) => createHash("sha256").update(value).digest();

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO public.users (id, phone_e164, created_at) VALUES (${ownerId}, '+213500000001', ${now})`;
});

async function preparing() {
  serial += 1;
  const { sql } = database.get();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.media_uploads (owner_id, kind, content_type, bytes, status, quarantine_key,
      content_digest, created_at, adopted_at)
    VALUES (${ownerId}, 'application', 'image/png', 16, 'preparing',
      ${`quarantine/${serial.toString()}`}, ${digest(serial.toString())}, ${now}, ${now})
    RETURNING id
  `;
  if (!row) throw new Error("Expected the fixture upload to be inserted");
  return row.id;
}

async function processing() {
  const mediaId = await preparing();
  await repo().recordPreview({
    mediaId,
    previewKey: `preview/${mediaId}`,
    width: 1280,
    height: 720,
  });
  const { sql } = database.get();
  await sql`
    UPDATE public.media_uploads
    SET status = 'processing', crop_focal_x = 2500, crop_focal_y = 7500, crop_zoom_percent = 150
    WHERE id = ${mediaId}
  `;
  return mediaId;
}

function variantsFor(mediaId: string): PublishedVariant[] {
  return (["avif", "webp"] as const).flatMap((format) =>
    ([160, 320, 640, 960, 1280] as const).map((width) => ({
      format,
      width,
      height: (width * 9) / 16,
      bytes: 100 + width,
      storageKey: `public/${mediaId}/${width.toString()}.${format}`,
    })),
  );
}

async function stateOf(mediaId: string) {
  const { sql } = database.get();
  const [row] = await sql<{ status: string; thumbhash: string | null; variants: number }[]>`
    SELECT status, thumbhash,
      (SELECT count(*)::int FROM public.media_variants WHERE media_id = ${mediaId}) AS variants
    FROM public.media_uploads WHERE id = ${mediaId}
  `;
  return row;
}

test("[MER-14:db] the worker reads the upload it must prepare or publish", async () => {
  const mediaId = await preparing();
  expect(await repo().read(mediaId)).toEqual({
    mediaId,
    kind: "application",
    contentType: "image/png",
    status: "preparing",
    quarantineKey: `quarantine/${serial.toString()}`,
    crop: null,
  });
  const cropped = await processing();
  expect(await repo().read(cropped)).toMatchObject({
    status: "processing",
    crop: { focalX: 2500, focalY: 7500, zoomPercent: 150 },
  });
  expect(await repo().read("01932f18-3150-7c33-8a7a-999999999999")).toBeUndefined();
});

test("[MER-14:db] a preview moves a preparing photo to awaiting crop exactly once", async () => {
  const mediaId = await preparing();
  const preview = { mediaId, previewKey: `preview/${mediaId}`, width: 960, height: 1280 };
  expect(await repo().recordPreview(preview)).toBe("recorded");
  expect(await repo().recordPreview(preview)).toBe("stale");

  const { sql } = database.get();
  const [row] = await sql`
    SELECT status, preview_key AS "previewKey", preview_width AS width, preview_height AS height
    FROM public.media_uploads WHERE id = ${mediaId}
  `;
  expect(row).toEqual({
    status: "awaiting_crop",
    previewKey: preview.previewKey,
    width: 960,
    height: 1280,
  });
});

test("[MER-14:db] publishing stores all ten variants and the ready state together", async () => {
  const mediaId = await processing();
  const variants = variantsFor(mediaId);

  expect(await repo().publish({ mediaId, thumbhash, variants: variants.slice(1) })).toBe(
    "incomplete",
  );
  expect(await stateOf(mediaId)).toEqual({ status: "processing", thumbhash: null, variants: 0 });

  const duplicated = [...variants.slice(1), variants[1]].filter((variant) => variant !== undefined);
  expect(await repo().publish({ mediaId, thumbhash, variants: duplicated })).toBe("incomplete");
  expect(await stateOf(mediaId)).toEqual({ status: "processing", thumbhash: null, variants: 0 });

  expect(await repo().publish({ mediaId, thumbhash, variants })).toBe("published");
  expect(await stateOf(mediaId)).toEqual({ status: "ready", thumbhash, variants: 10 });

  expect(await repo().publish({ mediaId, thumbhash, variants })).toBe("stale");
  expect(await stateOf(mediaId)).toEqual({ status: "ready", thumbhash, variants: 10 });
});

test("[MER-14:db] a preparing photo cannot be published before its crop", async () => {
  const mediaId = await preparing();
  expect(await repo().publish({ mediaId, thumbhash, variants: variantsFor(mediaId) })).toBe(
    "stale",
  );
  expect(await stateOf(mediaId)).toEqual({ status: "preparing", thumbhash: null, variants: 0 });
});

test("[MER-14:db] only preparing or processing photos can be rejected", async () => {
  const early = await preparing();
  const late = await processing();
  const published = await processing();
  await repo().publish({ mediaId: published, thumbhash, variants: variantsFor(published) });

  expect(await repo().reject({ mediaId: early, reason: "content_type_mismatch" })).toBe("rejected");
  expect(await repo().reject({ mediaId: late, reason: "image_too_large" })).toBe("rejected");
  expect(await repo().reject({ mediaId: early, reason: "invalid_image" })).toBe("stale");
  expect(await repo().reject({ mediaId: published, reason: "invalid_image" })).toBe("stale");

  const { sql } = database.get();
  const rows = await sql`
    SELECT status, rejection_reason AS reason FROM public.media_uploads
    WHERE id IN (${early}, ${late}, ${published}) ORDER BY id
  `;
  expect([...rows]).toEqual([
    { status: "rejected", reason: "content_type_mismatch" },
    { status: "rejected", reason: "image_too_large" },
    { status: "ready", reason: null },
  ]);
});
