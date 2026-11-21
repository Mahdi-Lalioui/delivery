import { createHash, randomUUIDv7 } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runMigrations } from "graphile-worker";
import { mediaOutput } from "@zaafran/contracts/media";
import { createLocalMediaStore, type MediaStore } from "@zaafran/media";
import { beforeAll, expect, onTestFinished, test } from "vitest";
import { createSessionToken } from "../src/auth-crypto.ts";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const { database, openApi, seedActor } = registerMerchantApiFixture("2026-11-07T12:00:00.000Z");
const reservationPath = "/v1/media/uploads";

beforeAll(async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
});

function commandHeaders(actor: Awaited<ReturnType<typeof seedActor>>, key = randomUUIDv7()) {
  return { ...actor.headers, "idempotency-key": key, "x-expected-session-id": actor.sessionId };
}

async function jobsFor(mediaId: string) {
  const { sql } = database.get();
  return sql<{ identifier: string; key: string; payload: { mediaId: string; phase: string } }[]>`
    SELECT job.task_identifier AS identifier, job.key, stored.payload
    FROM graphile_worker.jobs AS job
    JOIN graphile_worker._private_jobs AS stored USING (id)
    WHERE stored.payload ->> 'mediaId' = ${mediaId}
    ORDER BY job.key
  `;
}

test("[MER-14:authz] private media reads require ownership and writes require the issuing session", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "zaafran-media-session-"));
  await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
  onTestFinished(() => rm(mediaRoot, { recursive: true, force: true }));
  const store = createLocalMediaStore({ root: mediaRoot });
  let objectReads = 0;
  const observedStore: MediaStore = {
    put: (input) => store.put(input),
    async get(key) {
      objectReads += 1;
      return store.get(key);
    },
    delete: (key) => store.delete(key),
  };
  const api = await openApi(undefined, { mediaStore: observedStore }, mediaRoot);
  const owner = await seedActor("+213500000191", "standard");
  const outsider = await seedActor("+213500000192", "standard");
  const { sql } = database.get();
  const secondSessionId = randomUUIDv7();
  const secondSession = createSessionToken();
  await sql`
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    SELECT ${secondSessionId}, user_id, ${secondSession.tokenHash}, transport, kind, request_ip,
      created_at, last_seen_at, expires_at
    FROM public.sessions WHERE id = ${owner.sessionId}
  `;
  const ownerOnSecondDevice = {
    ...owner,
    sessionId: secondSessionId,
    headers: { ...owner.headers, cookie: "__Host-session=" + secondSession.token },
  };

  const reserved = await api.inject({
    method: "POST",
    url: reservationPath,
    headers: commandHeaders(owner),
    payload: { kind: "application", contentType: "image/png", bytes: 4 },
  });
  expect(reserved.statusCode).toBe(201);
  const { mediaId } = mediaOutput.parse(reserved.json());

  const outsiderUpload = await api.inject({
    method: "PUT",
    url: `/v1/media/uploads/${mediaId}/content`,
    headers: { ...commandHeaders(outsider), "content-type": "application/octet-stream" },
    payload: Buffer.from("fake"),
  });
  expect(outsiderUpload.statusCode).toBe(404);
  expect(outsiderUpload.headers["cache-control"]).toBe("no-store");
  expect(await readdir(mediaRoot)).toEqual([]);
  expect(
    await sql`SELECT status, quarantine_key FROM public.media_uploads WHERE id = ${mediaId}`,
  ).toEqual([{ status: "awaiting_upload", quarantine_key: null }]);

  const ownerUpload = await api.inject({
    method: "PUT",
    url: `/v1/media/uploads/${mediaId}/content`,
    headers: { ...commandHeaders(owner), "content-type": "application/octet-stream" },
    payload: Buffer.from("real"),
  });
  expect(ownerUpload.statusCode).toBe(202);
  expect(mediaOutput.parse(ownerUpload.json()).status).toBe("preparing");
  expect(await readdir(mediaRoot)).toHaveLength(1);

  const quarantineKey = `quarantine/${mediaId}/fixture`;
  const previewKey = `preview/${mediaId}/fixture`;
  await sql`
    UPDATE public.media_uploads
    SET status = 'awaiting_crop', quarantine_key = ${quarantineKey},
      content_digest = ${Buffer.alloc(32)}, adopted_at = now(), preview_key = ${previewKey},
      preview_width = 96, preview_height = 54
    WHERE id = ${mediaId}
  `;
  const preview = Buffer.from("synthetic preview");
  await store.put({
    key: previewKey,
    body: Readable.from([preview]),
    bytes: preview.length,
    checksumSha256: createHash("sha256").update(preview).digest("base64"),
  });
  const statusUrl = `/v1/media/${mediaId}`;
  const previewUrl = statusUrl + "/preview";
  const ownerStatus = await api.inject({ url: statusUrl, headers: ownerOnSecondDevice.headers });
  expect(ownerStatus.statusCode).toBe(200);
  expect(mediaOutput.parse(ownerStatus.json())).toMatchObject({
    mediaId,
    sessionId: secondSessionId,
    status: "awaiting_crop",
  });
  for (const [url, cacheControl] of [
    [statusUrl, "no-store"],
    [previewUrl, "private, no-store"],
  ] as const) {
    const denied = await api.inject({ url, headers: outsider.headers });
    expect(denied.statusCode, url).toBe(404);
    expect(denied.json()).toMatchObject({ code: "not_found" });
    expect(denied.headers["cache-control"]).toBe(cacheControl);
    expect(denied.body).not.toContain(mediaId);
  }
  expect(objectReads).toBe(0);
  const ownerPreview = await api.inject({ url: previewUrl, headers: ownerOnSecondDevice.headers });
  expect(ownerPreview.statusCode).toBe(200);
  expect(ownerPreview.rawPayload).toEqual(preview);
  expect(objectReads).toBe(1);

  const cropInput = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };
  for (const actor of [outsider, ownerOnSecondDevice]) {
    const denied = await api.inject({
      method: "POST",
      url: `/v1/media/${mediaId}/crop`,
      headers: commandHeaders(actor),
      payload: cropInput,
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.headers["cache-control"]).toBe("no-store");
  }
  expect(
    await sql`SELECT status, crop_focal_x FROM public.media_uploads WHERE id = ${mediaId}`,
  ).toEqual([{ status: "awaiting_crop", crop_focal_x: null }]);
  expect(
    await sql`SELECT media_id FROM public.media_command_receipts WHERE media_id = ${mediaId} AND operation = 'crop'`,
  ).toEqual([]);
  expect((await jobsFor(mediaId)).map((job) => job.key)).toEqual([`media:prepare:${mediaId}`]);

  const ownerCrop = await api.inject({
    method: "POST",
    url: `/v1/media/${mediaId}/crop`,
    headers: commandHeaders(owner),
    payload: cropInput,
  });
  expect(ownerCrop.statusCode).toBe(202);
  expect(mediaOutput.parse(ownerCrop.json()).status).toBe("processing");

  const variantMedia = await api.inject({
    method: "POST",
    url: reservationPath,
    headers: commandHeaders(owner),
    payload: { kind: "application", contentType: "image/png", bytes: 4 },
  });
  expect(variantMedia.statusCode).toBe(201);
  const { mediaId: variantMediaId } = mediaOutput.parse(variantMedia.json());
  const variantKey = `private/${variantMediaId}/webp-160`;
  const variantBytes = Buffer.from("private image bytes");
  const formats = ["avif", "webp"] as const;
  const widths = [160, 320, 640, 960, 1280] as const;
  const variants = formats.flatMap((format) =>
    widths.map((width) => ({
      format,
      width,
      height: (width * 9) / 16,
      bytes: variantBytes.length,
      key:
        format === "webp" && width === 160
          ? variantKey
          : `${format}-${width.toString()}-${variantMediaId}`,
    })),
  );
  await sql`
    UPDATE public.media_uploads
    SET status = 'ready', quarantine_key = ${`quarantine/${variantMediaId}/fixture`},
      content_digest = ${Buffer.alloc(32)}, adopted_at = now(),
      preview_key = ${`preview/${variantMediaId}/fixture`}, preview_width = 96,
      preview_height = 54, crop_focal_x = 5000, crop_focal_y = 5000,
      crop_zoom_percent = 100, ready_variants = ${JSON.stringify(variants)}::jsonb,
      thumbhash = 'YWJjZGVmZ2g='
    WHERE id = ${variantMediaId}
  `;
  await store.put({
    key: variantKey,
    body: Readable.from([variantBytes]),
    bytes: variantBytes.length,
    checksumSha256: createHash("sha256").update(variantBytes).digest("base64"),
  });

  const variantUrl = `/v1/media/${variantMediaId}/variants/webp/160`;
  const readsBeforeVariant = objectReads;
  const ownerVariant = await api.inject({ url: variantUrl, headers: owner.headers });
  expect(ownerVariant.statusCode).toBe(200);
  expect(ownerVariant.headers["cache-control"]).toBe("private, no-store");
  expect(ownerVariant.rawPayload).toEqual(variantBytes);
  expect(objectReads).toBe(readsBeforeVariant + 1);
  const outsiderVariant = await api.inject({ url: variantUrl, headers: outsider.headers });
  expect(outsiderVariant.statusCode).toBe(404);
  expect(outsiderVariant.headers["cache-control"]).toBe("private, no-store");
  expect(objectReads).toBe(readsBeforeVariant + 1);
});
