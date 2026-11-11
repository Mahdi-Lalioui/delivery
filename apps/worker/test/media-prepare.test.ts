import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { MediaPreparationCompletion, MediaPreparationSource } from "@zaafran/db/media";
import { createLocalMediaStore, type MediaStore } from "@zaafran/media";
import { afterEach, expect, test, vi } from "vitest";
import { createPrepareMediaJob } from "../src/media-prepare.js";
import { testPng } from "./media-fixture.ts";

const mediaId = "01932f18-3150-7c33-8a7a-000000000001";
const quarantineKey = `quarantine/${mediaId}/original`;
const payload = { mediaId, phase: "prepare" };
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(contentType: "image/png" | "image/jpeg" = "image/png") {
  const root = await mkdtemp(join(tmpdir(), "prepare-photo-test-"));
  roots.push(root);
  const store = createLocalMediaStore({ root });
  const digest = createHash("sha256").update(testPng).digest();
  await store.put({
    key: quarantineKey,
    body: Readable.from(testPng),
    bytes: testPng.length,
    checksumSha256: digest.toString("base64"),
  });
  let source: MediaPreparationSource | undefined = {
    status: "preparing",
    quarantineKey,
    contentType,
    bytes: testPng.length,
    digest,
  };
  const complete = vi.fn((completion: MediaPreparationCompletion) => {
    if (completion.mediaId !== mediaId || completion.quarantineKey !== source?.quarantineKey) {
      return Promise.resolve(false);
    }
    if (source.status !== "preparing") return Promise.resolve(false);
    source =
      completion.result.status === "rejected" ? { status: "rejected", quarantineKey } : undefined;
    return Promise.resolve(true);
  });
  const recordArtifact = vi
    .fn<(id: string, key: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const job = (overrides: Partial<MediaStore> = {}) =>
    createPrepareMediaJob({
      store: { ...store, ...overrides },
      recordArtifact,
      repository: {
        findPreparation: (id) => Promise.resolve(id === mediaId ? source : undefined),
        completePreparation: complete,
      },
    });
  return { store, complete, job, recordArtifact };
}

test.each([
  { mediaId: "invalid", phase: "prepare" },
  { mediaId, phase: "crop" },
  { ...payload, quarantineKey },
])("[MER-14:worker] rejects malformed job payloads before touching quarantine", async (invalid) => {
  const { job, complete } = await fixture();
  const get = vi.fn<MediaStore["get"]>();
  await expect(job({ get })(invalid)).rejects.toMatchObject({ name: "ZodError" });
  expect(get).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

test("[MER-14:worker] retries a preview write failure without publishing a broken reference", async () => {
  const { store, complete, job } = await fixture();
  const put = vi.fn(store.put.bind(store)).mockRejectedValueOnce(new Error("storage unavailable"));
  const run = job({ put });
  await expect(run(payload)).rejects.toThrow("storage unavailable");
  expect(complete).not.toHaveBeenCalled();
  await run(payload);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(complete.mock.calls[0]?.[0]).toMatchObject({
    mediaId,
    quarantineKey,
    result: { status: "awaiting_crop", width: 2, height: 1 },
  });
});

test("[MER-14:worker] reuses the immutable preview after an interruption before the DB update", async () => {
  const { store, complete, job, recordArtifact } = await fixture();
  const put = vi.fn(store.put.bind(store));
  const get = vi.fn(store.get.bind(store));
  const run = job({ put, get });
  complete.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(run(payload)).rejects.toThrow("database unavailable");
  const [firstWrite] = put.mock.calls;
  if (!firstWrite) throw new Error("Missing preview write");
  const previewKey = firstWrite[0].key;
  expect(recordArtifact).toHaveBeenCalledExactlyOnceWith(mediaId, previewKey);
  expect(recordArtifact).toHaveBeenCalledBefore(put);
  const preview = await store.get(previewKey);
  if (!preview) throw new Error("Missing preview");
  const previewDigest = createHash("sha256")
    .update(await buffer(preview.body))
    .digest("hex");
  expect(previewKey).toContain(previewDigest);

  await run(payload);
  await expect(put.mock.results[1]?.value).resolves.toBe("exists");
  expect(complete).toHaveBeenLastCalledWith({
    mediaId,
    quarantineKey,
    result: { status: "awaiting_crop", previewKey, width: 2, height: 1 },
  });
  await run(payload);
  expect(get).toHaveBeenCalledTimes(2);
  expect(put).toHaveBeenCalledTimes(2);
});

test("[MER-14:worker] retries original cleanup after committing deterministic rejection", async () => {
  const { store, complete, job } = await fixture("image/jpeg");
  const remove = vi
    .fn(store.delete.bind(store))
    .mockRejectedValueOnce(new Error("storage unavailable"));
  const run = job({ delete: remove });
  complete.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(run(payload)).rejects.toThrow("database unavailable");
  expect(remove).not.toHaveBeenCalled();

  await expect(run(payload)).rejects.toThrow("storage unavailable");
  expect(complete).toHaveBeenLastCalledWith({
    mediaId,
    quarantineKey,
    result: { status: "rejected", reason: "content_type_mismatch" },
  });
  const original = await store.get(quarantineKey);
  if (!original) throw new Error("Deleted the original before durable rejection");
  expect(await buffer(original.body)).toEqual(testPng);

  await run(payload);
  expect(complete).toHaveBeenCalledTimes(2);
  await expect(store.get(quarantineKey)).resolves.toBeUndefined();
});

test.each([
  {
    description: "object metadata disagrees with the receipt",
    bytes: testPng.length + 1,
    value: testPng,
  },
  {
    description: "stream is shorter than the receipt",
    bytes: testPng.length,
    value: testPng.subarray(1),
  },
  {
    description: "stream exceeds the receipt",
    bytes: testPng.length,
    value: Buffer.concat([testPng, Buffer.from([0])]),
  },
  {
    description: "stream checksum differs from the receipt",
    bytes: testPng.length,
    value: Buffer.alloc(testPng.length),
  },
])("[MER-14:worker] retries quarantine reads when $description", async ({ bytes, value }) => {
  const { complete, job } = await fixture();
  const body = Readable.from(value);
  const put = vi.fn<MediaStore["put"]>();
  await expect(
    job({ get: () => Promise.resolve({ body, bytes }), put })(payload),
  ).rejects.toThrow();
  expect(body.destroyed).toBe(true);
  expect(put).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});
