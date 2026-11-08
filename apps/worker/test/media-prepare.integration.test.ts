import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { createMediaRepository } from "@zaafran/db/media";
import { createLocalMediaStore } from "@zaafran/media";
import { runOnce } from "graphile-worker";
import { expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { migrateWorker } from "../src/migrate-worker.ts";
import { createWorkerOptions } from "../src/runtime.ts";
import { testPng } from "./media-fixture.ts";

const database = registerTestDatabase();
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest();

test("[MER-14:worker] the queued preparation saves a private preview and retains the original for cropping", async () => {
  const connection = database.get();
  const databaseUrl = database.url();
  const { sql } = connection;
  await migrateWorker(databaseUrl);

  const accountId = "01932f18-3150-7c33-8a7a-000000000001";
  const sessionId = "01932f18-3150-7c33-8a7a-000000000002";
  const now = new Date("2026-11-08T12:00:00.000Z");
  const expiresAt = new Date(now.getTime() + 3_600_000);
  const scope = { accountId, sessionId, now };
  await sql`
    INSERT INTO public.users (id, phone_e164, created_at)
    VALUES (${accountId}, '+213500000001', ${now.toISOString()})
  `;
  await sql`
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${sessionId}, ${accountId}, ${hash(sessionId)}, 'web', 'standard', '192.0.2.1',
      ${now.toISOString()}, ${now.toISOString()}, ${expiresAt.toISOString()})
  `;

  const repository = createMediaRepository(connection);
  const upload = { contentType: "image/png", bytes: testPng.length } as const;
  const reserved = await repository.reserve({
    ...scope,
    input: { kind: "application", ...upload },
    idempotencyKeyHash: hash("prepare-media"),
    requestHash: hash(JSON.stringify(upload)),
  });
  if (reserved.kind !== "created") throw new Error("Expected a new reservation");
  const { mediaId } = reserved.media;
  const quarantineKey = `quarantine/${mediaId}/original`;
  const root = await mkdtemp(join(tmpdir(), "worker-media-"));

  try {
    const store = createLocalMediaStore({ root });
    const digest = hash(testPng);
    await store.put({
      key: quarantineKey,
      body: Readable.from(testPng),
      bytes: upload.bytes,
      checksumSha256: digest.toString("base64"),
    });
    await expect(
      repository.acceptUpload({ ...scope, ...upload, mediaId, digest, quarantineKey }),
    ).resolves.toMatchObject({ kind: "accepted" });

    const options = createWorkerOptions(databaseUrl, connection, { store });
    await runOnce({ ...options, noHandleSignals: true });

    await expect(repository.read({ ...scope, mediaId })).resolves.toMatchObject({
      status: "awaiting_crop",
      width: 2,
      height: 1,
    });
    const [stored] = await sql<{ previewKey: string }[]>`
      SELECT preview_key AS "previewKey" FROM public.media_uploads WHERE id = ${mediaId}
    `;
    const preview = stored && (await store.get(stored.previewKey));
    if (!preview) throw new Error("Missing private preview");
    expect((await buffer(preview.body)).toString("ascii", 8, 12)).toBe("WEBP");
    const original = await store.get(quarantineKey);
    if (!original) throw new Error("Missing quarantined original");
    expect(await buffer(original.body)).toEqual(testPng);
    expect(await sql`SELECT id FROM graphile_worker.jobs`).toHaveLength(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
