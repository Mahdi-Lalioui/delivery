import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { MediaCropCompletion, MediaCropWork } from "@zaafran/db/media";
import type { MediaStore } from "@zaafran/media";
import { expect, test, vi } from "vitest";
import { createCropMediaJob } from "../src/media-crop.ts";
import { testPng } from "./media-fixture.ts";

const mediaId = "01932f18-3150-7c33-8a7a-000000000001";
const payload = { mediaId, phase: "crop" };
const quarantineKey = "quarantine/original";
const previewKey = "preview/private";

test("[MER-14:worker] retries a partial variant write and resumes cleanup after publication", async () => {
  let source: MediaCropWork = {
    status: "processing",
    quarantineKey,
    previewKey,
    kind: "application",
    contentType: "image/png",
    bytes: testPng.length,
    digest: createHash("sha256").update(testPng).digest(),
    crop: { focalX: 5000, focalY: 5000, zoomPercent: 100 },
  };
  const store = {
    get: vi
      .fn<MediaStore["get"]>()
      .mockImplementation(() =>
        Promise.resolve({ bytes: testPng.length, body: Readable.from([testPng]) }),
      ),
    put: vi
      .fn<MediaStore["put"]>()
      .mockResolvedValue("stored")
      .mockResolvedValueOnce("stored")
      .mockRejectedValueOnce(new Error("variant write failed")),
    delete: vi
      .fn<MediaStore["delete"]>()
      .mockResolvedValue(undefined)
      .mockRejectedValueOnce(new Error("cleanup failed")),
  };
  const completeCrop = vi.fn<(request: MediaCropCompletion) => Promise<boolean>>(() => {
    source = { status: "ready", quarantineKey, previewKey };
    return Promise.resolve(true);
  });
  const run = createCropMediaJob({
    store,
    repository: { findCropWork: () => Promise.resolve(source), completeCrop },
  });
  await expect(run(payload)).rejects.toThrow("variant write failed");
  expect(completeCrop).not.toHaveBeenCalled();
  expect(store.delete).not.toHaveBeenCalled();

  await expect(run(payload)).rejects.toThrow("cleanup failed");
  expect(completeCrop).toHaveBeenCalledTimes(1);
  const [completion] = completeCrop.mock.calls[0] ?? [];
  if (!completion) throw new Error("Missing crop completion.");
  expect(completion).toMatchObject({ mediaId, quarantineKey, result: { status: "ready" } });
  expect(completion.result.thumbhash).toMatch(/^[A-Za-z0-9+/]+=*$/u);
  expect(completion.result.variants).toHaveLength(10);
  expect(
    completion.result.variants.find(({ format, width }) => format === "webp" && width === 160),
  ).toMatchObject({ height: 90 });
  expect(
    completion.result.variants.find(({ format, width }) => format === "avif" && width === 1280),
  ).toMatchObject({ height: 720 });
  expect(store.put).toHaveBeenCalledTimes(12);
  expect(store.put.mock.calls[0]?.[0].key).toBe(store.put.mock.calls[2]?.[0].key);

  await run(payload);
  expect(store.get).toHaveBeenCalledTimes(2);
  expect(completeCrop).toHaveBeenCalledTimes(1);
  expect(store.delete.mock.calls).toEqual([[quarantineKey], [quarantineKey], [previewKey]]);
});
