import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = "2026-11-13T06:00:00.000Z";
const ownerId = "01932f18-3150-7c33-8a7a-000000000001";
let serial = 0;

const digest = (value: string) => createHash("sha256").update(value).digest();
const preview = { previewKey: "preview/fixture", previewWidth: 1280, previewHeight: 720 };
const crop = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };

interface StateColumns {
  readonly status: string;
  readonly previewKey?: string;
  readonly previewWidth?: number;
  readonly previewHeight?: number;
  readonly focalX?: number;
  readonly focalY?: number;
  readonly zoomPercent?: number;
  readonly thumbhash?: string;
  readonly rejectionReason?: string;
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO public.users (id, phone_e164, created_at) VALUES (${ownerId}, '+213500000001', ${now})`;
});

async function insertUpload(state: StateColumns) {
  serial += 1;
  const { sql } = database.get();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.media_uploads (owner_id, kind, content_type, bytes, status, quarantine_key,
      content_digest, created_at, adopted_at, preview_key, preview_width, preview_height,
      crop_focal_x, crop_focal_y, crop_zoom_percent, thumbhash, rejection_reason)
    VALUES (${ownerId}, 'application', 'image/png', 16, ${state.status},
      ${`quarantine/${serial.toString()}`}, ${digest(serial.toString())}, ${now}, ${now},
      ${state.previewKey === undefined ? null : `${state.previewKey}/${serial.toString()}.webp`}, ${state.previewWidth ?? null}, ${state.previewHeight ?? null},
      ${state.focalX ?? null}, ${state.focalY ?? null}, ${state.zoomPercent ?? null},
      ${state.thumbhash ?? null}, ${state.rejectionReason ?? null})
    RETURNING id
  `;
  if (!row) throw new Error("Expected the fixture upload to be inserted");
  return row.id;
}

const thumbhash = "1QcSHQRnh493V4dIh4eXh1h4kJUI";

test("[MER-14] each processed photo state stores exactly the fields it needs", async () => {
  await expect(insertUpload({ status: "preparing" })).resolves.toBeTypeOf("string");
  await expect(insertUpload({ status: "awaiting_crop", ...preview })).resolves.toBeTypeOf("string");
  await expect(insertUpload({ status: "processing", ...preview, ...crop })).resolves.toBeTypeOf(
    "string",
  );
  await expect(
    insertUpload({ status: "ready", ...preview, ...crop, thumbhash }),
  ).resolves.toBeTypeOf("string");
  await expect(
    insertUpload({ status: "rejected", rejectionReason: "invalid_image" }),
  ).resolves.toBeTypeOf("string");
  await expect(
    insertUpload({ status: "rejected", ...preview, ...crop, rejectionReason: "image_too_large" }),
  ).resolves.toBeTypeOf("string");
});

test("[MER-14] a photo cannot skip the preview, crop, thumbhash or rejection reason", async () => {
  const invalid: StateColumns[] = [
    { status: "preparing", ...preview },
    { status: "awaiting_crop" },
    { status: "awaiting_crop", ...preview, ...crop },
    { status: "processing", ...preview },
    { status: "ready", ...preview, ...crop },
    { status: "ready", ...preview, ...crop, thumbhash, rejectionReason: "invalid_image" },
    { status: "rejected" },
    { status: "rejected", rejectionReason: "unknown" },
    { status: "rejected", rejectionReason: "invalid_image", thumbhash },
    { status: "uploaded" },
  ];
  for (const state of invalid) {
    await expect(insertUpload(state), JSON.stringify(state)).rejects.toMatchObject({
      code: "23514",
    });
  }
});

test("[MER-14] the crop and preview stay inside the published bounds", async () => {
  const invalid: StateColumns[] = [
    { status: "awaiting_crop", ...preview, previewWidth: 1281 },
    { status: "awaiting_crop", ...preview, previewHeight: 0 },
    { status: "processing", ...preview, ...crop, focalX: 10_001 },
    { status: "processing", ...preview, ...crop, focalY: -1 },
    { status: "processing", ...preview, ...crop, zoomPercent: 99 },
    { status: "processing", ...preview, ...crop, zoomPercent: 401 },
  ];
  for (const state of invalid) {
    await expect(insertUpload(state), JSON.stringify(state)).rejects.toMatchObject({
      code: "23514",
    });
  }
});

test("[MER-14] variants are unique per format and width and leave with their photo", async () => {
  const mediaId = await insertUpload({ status: "processing", ...preview, ...crop });
  const { sql } = database.get();
  const insertVariant = (format: string, width: number, key: string) => sql`
    INSERT INTO public.media_variants (media_id, format, width, height, bytes, storage_key)
    VALUES (${mediaId}, ${format}, ${width}, ${(width * 9) / 16}, 512, ${key})
  `;

  await insertVariant("avif", 160, "public/a-160.avif");
  await expect(insertVariant("avif", 160, "public/b-160.avif")).rejects.toMatchObject({
    code: "23505",
  });
  await expect(insertVariant("jpeg", 320, "public/c-320.jpeg")).rejects.toMatchObject({
    code: "23514",
  });
  await expect(insertVariant("webp", 400, "public/d-400.webp")).rejects.toMatchObject({
    code: "23514",
  });
  await expect(insertVariant("webp", 320, "public/a-160.avif")).rejects.toMatchObject({
    code: "23505",
  });

  await sql`DELETE FROM public.media_uploads WHERE id = ${mediaId}`;
  const [remaining] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM public.media_variants WHERE media_id = ${mediaId}
  `;
  expect(remaining?.count).toBe(0);
});
