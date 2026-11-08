import { afterEach, expect, test, vi } from "vitest";
import { finishPhoto, preparePhoto, readSelectedPhoto } from "../src/media-photo/media-photo-http";

const sessionId = "019d6abc-1234-7234-8234-123456789000";
const mediaId = "019d6abc-1234-7234-8234-123456789001";
const merchantId = "019d6abc-1234-7234-8234-123456789002";
const otherSession = "019d6abc-1234-7234-8234-123456789003";
const scope = { kind: "item", merchantId, sessionId } as const;
const identity = { kind: "item", mediaId, sessionId } as const;
const file = new File(["sample"], "photo.heic");
const signal = new AbortController().signal;
const reserve = () => ({ scope, file, key: "reserve-key" });
const awaitingCrop = { ...identity, status: "awaiting_crop", width: 640, height: 480 };
const ready = {
  ...identity,
  status: "ready",
  thumbhash: "AAAAAAAA",
  variants: [160, 320, 640, 960, 1280].flatMap((width) =>
    ["avif", "webp"].map((format) => ({ format, width, height: (width * 3) / 4, bytes: 42 })),
  ),
};
const crop = { focalX: 5300, focalY: 2000, zoomPercent: 175 };
const cropAttempt = () => ({ scope, mediaId, crop, key: "crop-key" });

function image() {
  return new Response("sanitized", { headers: { "Content-Type": "image/webp" } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("[MER-14:web] reserves HEIC with session scope, PUTs raw bytes and loads a private crop preview", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json({ ...identity, status: "awaiting_upload" }, { status: 201 }),
    )
    .mockResolvedValueOnce(Response.json({ ...identity, status: "preparing" }, { status: 202 }))
    .mockResolvedValueOnce(Response.json(awaitingCrop))
    .mockResolvedValueOnce(image());
  vi.stubGlobal("fetch", fetch);

  const result = preparePhoto(reserve(), signal);
  await vi.runAllTimersAsync();
  const { blob, ...status } = await result;
  expect(blob.type).toBe("image/webp");
  expect(status).toEqual(awaitingCrop);
  const body = fetch.mock.calls[0]?.[1]?.body;
  expect(typeof body === "string" ? JSON.parse(body) : null).toEqual({
    kind: "item",
    merchantId,
    contentType: "image/heic",
    bytes: 6,
  });
  expect(fetch.mock.calls).toEqual([
    [
      "/v1/media/uploads",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "reserve-key",
          "x-expected-session-id": sessionId,
        },
      }),
    ],
    [
      `/v1/media/uploads/${mediaId}/content`,
      expect.objectContaining({
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": "application/octet-stream",
          "x-expected-session-id": sessionId,
        },
      }),
    ],
    [`/v1/media/${mediaId}`, expect.objectContaining({ credentials: "same-origin" })],
    [
      `/v1/media/${mediaId}/preview`,
      expect.objectContaining({ credentials: "same-origin", cache: "no-store", redirect: "error" }),
    ],
  ]);
});

test("[MER-14:web] replays the identical crop after a lost response and fetches the published WebP", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockRejectedValueOnce(new TypeError("Connection reset"))
    .mockResolvedValueOnce(Response.json({ ...identity, status: "processing" }, { status: 202 }))
    .mockResolvedValueOnce(Response.json(ready))
    .mockResolvedValueOnce(image());
  vi.stubGlobal("fetch", fetch);

  const attempt = cropAttempt();
  await expect(finishPhoto(attempt, signal)).rejects.toMatchObject({ code: "retryError" });
  const result = finishPhoto(attempt, signal);
  await vi.runAllTimersAsync();
  const { blob, ...selected } = await result;
  expect(blob.type).toBe("image/webp");
  expect(selected).toEqual({ mediaId, width: 640, height: 480 });

  for (const [path, init] of fetch.mock.calls.slice(0, 2)) {
    expect(path).toBe(`/v1/media/${mediaId}/crop`);
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "crop-key",
        "x-expected-session-id": sessionId,
      },
      body: JSON.stringify(crop),
    });
  }
  expect(fetch.mock.calls[3]).toEqual([
    `/v1/media/${mediaId}/variants/webp/640`,
    expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
  ]);
});

test("[MER-14:web] rejects unsupported files and enforces the 8 MiB bound before reserve", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const badFile = new File(["image"], "photo.svg", { type: "image/svg+xml" });
  const large = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "photo.jpg", {
    type: "image/jpeg",
  });

  await expect(preparePhoto({ ...reserve(), file: badFile }, signal)).rejects.toMatchObject({
    code: "invalidFile",
  });
  await expect(preparePhoto({ ...reserve(), file: large }, signal)).rejects.toMatchObject({
    code: "fileTooLarge",
  });
  expect(fetch).not.toHaveBeenCalled();
});

test("[MER-14:web] stops before reading pixels when the API session no longer matches", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ ...ready, sessionId: otherSession }));
  vi.stubGlobal("fetch", fetch);
  await expect(readSelectedPhoto({ scope, mediaId }, signal)).rejects.toMatchObject({
    code: "sessionChanged",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("[MER-14:web] aborting a reservation prevents a late response from sending binary bytes", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValueOnce(pending.promise);
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();

  const result = preparePhoto(reserve(), controller.signal);
  controller.abort();
  pending.resolve(Response.json({ ...identity, status: "awaiting_upload" }));
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("[MER-14:web] reports worker rejection and never reads an unsanitized preview", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ ...identity, status: "awaiting_upload" }))
    .mockResolvedValueOnce(
      Response.json({
        ...identity,
        status: "rejected",
        reason: "content_type_mismatch",
      }),
    );
  vi.stubGlobal("fetch", fetch);

  await expect(preparePhoto(reserve(), signal)).rejects.toMatchObject({ code: "contentMismatch" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("[MER-14:web] stops polling stalled preparation and keeps the request retryable", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ ...identity, status: "awaiting_upload" }))
    .mockImplementation(() => Promise.resolve(Response.json({ ...identity, status: "preparing" })));
  vi.stubGlobal("fetch", fetch);
  const result = expect(preparePhoto(reserve(), signal)).rejects.toMatchObject({
    code: "pollTimeout",
  });

  await vi.runAllTimersAsync();
  await result;
  expect(fetch.mock.calls.length).toBeGreaterThan(2);
  expect(fetch.mock.calls.length).toBeLessThan(40);
});

test("[MER-14:web] retries a lost binary receipt for the same reservation and file", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ ...identity, status: "awaiting_upload" }))
    .mockRejectedValueOnce(new TypeError("Upload response lost"))
    .mockResolvedValueOnce(Response.json(awaitingCrop))
    .mockResolvedValueOnce(image());
  vi.stubGlobal("fetch", fetch);
  const attempt = reserve();

  await expect(preparePhoto(attempt, signal)).rejects.toMatchObject({ code: "retryError" });
  const preview = await preparePhoto(attempt, signal);
  expect(preview.mediaId).toBe(mediaId);
  const uploadRequests = fetch.mock.calls.filter(([, init]) => init?.method === "PUT");
  expect(uploadRequests.map(([path, init]) => [path, init?.body])).toEqual([
    [`/v1/media/uploads/${mediaId}/content`, file],
    [`/v1/media/uploads/${mediaId}/content`, file],
  ]);
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
