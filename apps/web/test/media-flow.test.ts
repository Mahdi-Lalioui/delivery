import { expect, test, vi } from "vitest";
import { finishPhotoCrop, startPhotoUpload, type PhotoClient } from "../src/media/media-flow";

const mediaId = "019d6abc-1234-7234-8234-123456789030";
const sessionId = "019d6abc-1234-7234-8234-123456789031";
const merchantId = "019d6abc-1234-7234-8234-123456789032";
const signal = new AbortController().signal;
const base = { mediaId, sessionId, kind: "item" } as const;
const awaitingUpload = { ...base, status: "awaiting_upload" } as const;
const preparing = { ...base, status: "preparing" } as const;
const processing = { ...base, status: "processing" } as const;
const awaitingCrop = { ...base, status: "awaiting_crop", width: 1280, height: 960 } as const;
const rejected = { ...base, status: "rejected", reason: "invalid_image" } as const;
const ready = {
  ...base,
  status: "ready",
  thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
  variants: (["avif", "webp"] as const).flatMap((format) =>
    ([160, 320, 640, 960, 1280] as const).map((width) => ({
      format,
      width,
      height: (width * 3) / 4,
      bytes: 100,
    })),
  ),
} as const;
const crop = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };
const target = { kind: "item", merchantId } as const;
const png = new File([new Uint8Array(16)], "plat.png", { type: "image/png" });

function fakeClient() {
  return {
    reservePhoto: vi.fn<PhotoClient["reservePhoto"]>(),
    uploadPhotoContent: vi.fn<PhotoClient["uploadPhotoContent"]>(),
    readPhoto: vi.fn<PhotoClient["readPhoto"]>(),
    choosePhotoCrop: vi.fn<PhotoClient["choosePhotoCrop"]>(),
  } satisfies PhotoClient;
}

function options(client: PhotoClient, wait = vi.fn(() => Promise.resolve())) {
  return { client, wait, sessionId, signal, maxPolls: 3, pollMs: 500 };
}

test("[MER-14] uploads the file, then polls until the private preview is ready to crop", async () => {
  const client = fakeClient();
  client.reservePhoto.mockResolvedValue({ kind: "ready", data: awaitingUpload });
  client.uploadPhotoContent.mockResolvedValue({ kind: "ready", data: preparing });
  client.readPhoto
    .mockResolvedValueOnce({ kind: "ready", data: preparing })
    .mockResolvedValueOnce({ kind: "ready", data: awaitingCrop });
  const wait = vi.fn(() => Promise.resolve());

  await expect(
    startPhotoUpload({ ...options(client, wait), file: png, target, idempotencyKey: "k" }),
  ).resolves.toEqual({ kind: "crop", photo: awaitingCrop });
  expect(client.reservePhoto).toHaveBeenCalledExactlyOnceWith({
    input: { kind: "item", merchantId, contentType: "image/png", bytes: 16 },
    sessionId,
    idempotencyKey: "k",
    signal,
  });
  expect(client.uploadPhotoContent).toHaveBeenCalledExactlyOnceWith({
    mediaId,
    sessionId,
    file: png,
    signal,
  });
  expect(wait.mock.calls).toEqual([
    [500, signal],
    [500, signal],
  ]);
});

test("[MER-14] refuses unsupported or oversized files before reserving anything", async () => {
  const client = fakeClient();
  const gif = new File([new Uint8Array(4)], "a.gif", { type: "image/gif" });
  const huge = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
  const empty = new File([], "a.png", { type: "image/png" });
  const run = (file: File) =>
    startPhotoUpload({ ...options(client), file, target, idempotencyKey: "k" });

  await expect(run(gif)).resolves.toEqual({ kind: "unsupported-type" });
  await expect(run(huge)).resolves.toEqual({ kind: "too-large" });
  await expect(run(empty)).resolves.toEqual({ kind: "unsupported-type" });
  expect(client.reservePhoto).not.toHaveBeenCalled();
});

test("[MER-14] reports a worker rejection, a failed step and a photo that never settles", async () => {
  const client = fakeClient();
  client.reservePhoto.mockResolvedValue({ kind: "ready", data: awaitingUpload });
  client.uploadPhotoContent
    .mockResolvedValueOnce({ kind: "ready", data: preparing })
    .mockResolvedValueOnce({ kind: "content-mismatch" })
    .mockResolvedValueOnce({ kind: "ready", data: preparing });
  client.readPhoto
    .mockResolvedValueOnce({ kind: "ready", data: rejected })
    .mockResolvedValue({ kind: "ready", data: preparing });
  const run = () =>
    startPhotoUpload({ ...options(client), file: png, target, idempotencyKey: "k" });

  await expect(run()).resolves.toEqual({ kind: "rejected", reason: "invalid_image" });
  await expect(run()).resolves.toEqual({ kind: "content-mismatch" });
  await expect(run()).resolves.toEqual({ kind: "timed-out" });
  expect(client.readPhoto).toHaveBeenCalledTimes(4);
});

test("[MER-14] a replayed reservation that already moved on skips the upload", async () => {
  const client = fakeClient();
  client.reservePhoto.mockResolvedValue({ kind: "ready", data: awaitingCrop });

  await expect(
    startPhotoUpload({ ...options(client), file: png, target, idempotencyKey: "k" }),
  ).resolves.toEqual({ kind: "crop", photo: awaitingCrop });
  expect(client.uploadPhotoContent).not.toHaveBeenCalled();
  expect(client.readPhoto).not.toHaveBeenCalled();
});

test("[MER-14] sends the crop and polls until every variant is published", async () => {
  const client = fakeClient();
  client.choosePhotoCrop
    .mockResolvedValueOnce({ kind: "ready", data: processing })
    .mockResolvedValueOnce({ kind: "crop-conflict" });
  client.readPhoto
    .mockResolvedValueOnce({ kind: "ready", data: processing })
    .mockResolvedValueOnce({ kind: "ready", data: ready });

  await expect(finishPhotoCrop({ ...options(client), mediaId, crop })).resolves.toEqual({
    kind: "ready",
    photo: ready,
  });
  await expect(finishPhotoCrop({ ...options(client), mediaId, crop })).resolves.toEqual({
    kind: "crop-conflict",
  });
  expect(client.choosePhotoCrop).toHaveBeenCalledWith({ mediaId, sessionId, crop, signal });
});
