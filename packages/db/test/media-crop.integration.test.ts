import { createHash } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { beforeAll, expect, test } from "vitest";
import { createMediaRepository } from "../src/media.ts";
import { createMediaProcessingRepository } from "../src/media-processing.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-13T06:00:00.000Z");
const fixtureId = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const hash = (value: string) => createHash("sha256").update(value).digest();
const repo = () => createMediaRepository(database.get());
const crop = { focalX: 2500, focalY: 7500, zoomPercent: 150 };
let serial = 0;

beforeAll(async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
});

async function account(phoneSerial: number) {
  const { sql } = database.get();
  const accountId = fixtureId(phoneSerial);
  const sessionId = fixtureId(phoneSerial + 1_000);
  const at = now.toISOString();
  await sql`
    INSERT INTO public.users (id, phone_e164, created_at)
    VALUES (${accountId}, ${`+2135${String(phoneSerial).padStart(8, "0")}`}, ${at})
  `;
  await sql`
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${sessionId}, ${accountId}, ${hash(sessionId)}, 'web', 'standard', '192.0.2.1',
      ${at}, ${at}, ${new Date(now.getTime() + 3_600_000).toISOString()})
  `;
  return { accountId, sessionId, now };
}

async function adopted(scope: Awaited<ReturnType<typeof account>>, withPreview = true) {
  serial += 1;
  const input = { kind: "application", contentType: "image/png", bytes: 16 } as const;
  const reserved = await repo().reserve({
    ...scope,
    input,
    idempotencyKeyHash: hash(`key-${serial.toString()}`),
    requestHash: hash(JSON.stringify(input)),
  });
  if (reserved.kind !== "created") throw new Error("Expected a new reservation");
  const { mediaId } = reserved.media;
  await repo().acceptUpload({
    ...scope,
    mediaId,
    contentType: input.contentType,
    bytes: input.bytes,
    quarantineKey: `quarantine/${mediaId}/first`,
    digest: hash(`photo-${serial.toString()}`),
  });
  if (withPreview) {
    const preview = { mediaId, previewKey: `preview/${mediaId}`, width: 1280, height: 720 };
    await createMediaProcessingRepository(database.get()).recordPreview(preview);
  }
  return mediaId;
}

async function publishJobs(mediaId: string) {
  const { sql } = database.get();
  const rows = await sql`
    SELECT job.key, stored.payload FROM graphile_worker.jobs AS job
    JOIN graphile_worker._private_jobs AS stored USING (id)
    WHERE stored.payload ->> 'mediaId' = ${mediaId} AND stored.payload ->> 'phase' = 'publish'
  `;
  return [...rows];
}

test("[MER-14:db] accepting the crop starts publication once and replays the same crop", async () => {
  const owner = await account(1);
  const mediaId = await adopted(owner);

  const accepted = await repo().acceptCrop({ ...owner, mediaId, crop });
  expect(accepted).toMatchObject({ kind: "accepted", media: { mediaId, status: "processing" } });
  expect(await repo().acceptCrop({ ...owner, mediaId, crop })).toMatchObject({
    kind: "replayed",
    media: { mediaId, status: "processing" },
  });
  expect(
    await repo().acceptCrop({ ...owner, mediaId, crop: { ...crop, zoomPercent: 200 } }),
  ).toEqual({ kind: "crop_conflict" });
  expect(await publishJobs(mediaId)).toEqual([
    { key: `media:publish:${mediaId}`, payload: { mediaId, phase: "publish" } },
  ]);

  const { sql } = database.get();
  const [stored] = await sql`
    SELECT crop_focal_x AS "focalX", crop_focal_y AS "focalY", crop_zoom_percent AS "zoomPercent"
    FROM public.media_uploads WHERE id = ${mediaId}
  `;
  expect(stored).toEqual(crop);
});

test("[MER-14:db] the crop needs the preview, the owner and a live session", async () => {
  const owner = await account(2);
  const outsider = await account(3);
  const preparing = await adopted(owner, false);
  const waiting = await adopted(owner);

  expect(await repo().acceptCrop({ ...owner, mediaId: preparing, crop })).toEqual({
    kind: "crop_unavailable",
  });
  expect(await repo().acceptCrop({ ...outsider, mediaId: waiting, crop })).toEqual({
    kind: "not_found",
  });
  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = ${now.toISOString()} WHERE id = ${owner.sessionId}`;
  expect(await repo().acceptCrop({ ...owner, mediaId: waiting, crop })).toEqual({
    kind: "not_found",
  });
  expect(await publishJobs(preparing)).toEqual([]);
  expect(await publishJobs(waiting)).toEqual([]);
});
