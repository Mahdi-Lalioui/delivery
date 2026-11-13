import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createLocalMediaStore } from "@zaafran/media";
import { runOnce } from "graphile-worker";
import sharp from "sharp";
import { afterAll, expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { migrateWorker } from "../src/migrate-worker.ts";
import { createWorkerOptions } from "../src/runtime.ts";

const database = registerTestDatabase();
const now = "2026-11-13T06:00:00.000Z";
const ownerId = "01932f18-3150-7c33-8a7a-000000000001";
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

test("[MER-14:worker] the queue prepares a photo enqueued by its adoption", async () => {
  const connection = database.get();
  const databaseUrl = database.url();
  await migrateWorker(databaseUrl);
  const root = await mkdtemp(join(tmpdir(), "zaafran-media-queue-"));
  roots.push(root);
  const store = createLocalMediaStore({ root });

  const data = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  const digest = createHash("sha256").update(data);
  await store.put({
    key: "quarantine/queued",
    body: Readable.from([data]),
    bytes: data.length,
    checksumSha256: digest.copy().digest("base64"),
  });
  await connection.sql`
    INSERT INTO public.users (id, phone_e164, created_at) VALUES (${ownerId}, '+213500000001', ${now})
  `;
  const [upload] = await connection.sql<{ id: string }[]>`
    INSERT INTO public.media_uploads (owner_id, kind, content_type, bytes, status, quarantine_key,
      content_digest, created_at, adopted_at)
    VALUES (${ownerId}, 'application', 'image/png', ${data.length}, 'preparing',
      'quarantine/queued', ${digest.digest()}, ${now}, ${now})
    RETURNING id
  `;
  if (!upload) throw new Error("Expected the fixture upload to be inserted");
  await connection.sql`
    SELECT graphile_worker.add_job(
      'media.process', json_build_object('mediaId', ${upload.id}::uuid, 'phase', 'prepare'),
      queue_name => 'media'
    )
  `;

  const media = { store, maxPixels: 1_000_000 };
  await runOnce({ ...createWorkerOptions(databaseUrl, connection, media), noHandleSignals: true });

  const [prepared] = await connection.sql`
    SELECT status, preview_width AS width, preview_height AS height
    FROM public.media_uploads WHERE id = ${upload.id}
  `;
  expect(prepared).toEqual({ status: "awaiting_crop", width: 64, height: 48 });
  expect(await connection.sql`SELECT id FROM graphile_worker.jobs`).toHaveLength(0);
});
