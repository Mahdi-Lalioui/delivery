import { createHash } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { beforeAll, expect, test } from "vitest";
import { createMediaRepository } from "../src/media.ts";
import { createMediaProcessingRepository } from "../src/media-processing.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-13T06:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-000000000001";
const sessionId = "01932f18-3150-7c33-8a7a-000000000002";
const thumbhash = "1QcSHQRnh493V4dIh4eXh1h4kJUI";
const scope = { accountId, sessionId, now };
const hash = (value: string) => createHash("sha256").update(value).digest();
const repo = () => createMediaRepository(database.get());
const worker = () => createMediaProcessingRepository(database.get());
let serial = 0;

beforeAll(async () => {
  const { sql } = database.get();
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const at = now.toISOString();
  await sql`INSERT INTO public.users (id, phone_e164, created_at) VALUES (${accountId}, '+213500000001', ${at})`;
  await sql`
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${sessionId}, ${accountId}, ${hash(sessionId)}, 'web', 'standard', '192.0.2.1',
      ${at}, ${at}, ${new Date(now.getTime() + 3_600_000).toISOString()})
  `;
});

async function adopted() {
  serial += 1;
  const input = { kind: "application", contentType: "image/png", bytes: 16 } as const;
  const reservation = {
    ...scope,
    input,
    idempotencyKeyHash: hash(`key-${serial.toString()}`),
    requestHash: hash(JSON.stringify(input)),
  };
  const reserved = await repo().reserve(reservation);
  if (reserved.kind !== "created") throw new Error("Expected a new reservation");
  const { mediaId } = reserved.media;
  const upload = {
    ...scope,
    mediaId,
    contentType: input.contentType,
    bytes: input.bytes,
    quarantineKey: `quarantine/${mediaId}/first`,
    digest: hash(`photo-${serial.toString()}`),
  };
  await repo().acceptUpload(upload);
  return { mediaId, reservation, upload };
}

async function crop(mediaId: string) {
  const { sql } = database.get();
  await sql`
    UPDATE public.media_uploads
    SET status = 'processing', crop_focal_x = 5000, crop_focal_y = 5000, crop_zoom_percent = 100
    WHERE id = ${mediaId}
  `;
}

const variants = (mediaId: string) =>
  (["avif", "webp"] as const).flatMap((format) =>
    ([160, 320, 640, 960, 1280] as const).map((width) => ({
      format,
      width,
      height: (width * 9) / 16,
      bytes: 100 + width,
      storageKey: `media/${mediaId}/${width.toString()}.${format}`,
    })),
  );

test("[MER-14:db] the status read carries the preview size, variants or rejection reason", async () => {
  const identity = { sessionId, kind: "application" };
  const waiting = await adopted();
  await worker().recordPreview({
    mediaId: waiting.mediaId,
    previewKey: `preview/${waiting.mediaId}`,
    width: 1280,
    height: 720,
  });
  const awaitingCrop = await repo().read({ ...scope, mediaId: waiting.mediaId });
  expect(awaitingCrop).toEqual({
    ...identity,
    mediaId: waiting.mediaId,
    status: "awaiting_crop",
    width: 1280,
    height: 720,
  });

  const published = await adopted();
  await worker().recordPreview({
    mediaId: published.mediaId,
    previewKey: `preview/${published.mediaId}`,
    width: 640,
    height: 360,
  });
  await crop(published.mediaId);
  await worker().publish({
    mediaId: published.mediaId,
    thumbhash,
    variants: variants(published.mediaId),
  });
  const ready = await repo().read({ ...scope, mediaId: published.mediaId });
  expect(ready).toMatchObject({ ...identity, status: "ready", thumbhash });
  const variantsRead = ready && "variants" in ready ? ready.variants : [];
  expect(variantsRead).toHaveLength(10);
  expect(variantsRead).toContainEqual({
    format: "avif",
    width: 160,
    height: 90,
    bytes: 260,
  });

  const refused = await adopted();
  await worker().reject({ mediaId: refused.mediaId, reason: "invalid_image" });
  const rejected = await repo().read({ ...scope, mediaId: refused.mediaId });
  expect(rejected).toEqual({
    ...identity,
    mediaId: refused.mediaId,
    status: "rejected",
    reason: "invalid_image",
  });
});

test("[MER-14:db] replayed reservations and uploads report the photo's current state", async () => {
  const { mediaId, reservation, upload } = await adopted();
  await worker().reject({ mediaId, reason: "content_type_mismatch" });
  const expected = { status: "rejected", reason: "content_type_mismatch" };

  const reserved = await repo().reserve(reservation);
  expect(reserved).toMatchObject({ kind: "replayed", media: { mediaId, ...expected } });
  const replayed = await repo().acceptUpload(upload);
  expect(replayed).toMatchObject({ kind: "replayed", media: { mediaId, ...expected } });
});
