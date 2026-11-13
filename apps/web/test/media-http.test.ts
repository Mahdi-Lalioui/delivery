import { afterEach, expect, test, vi } from "vitest";
import {
  choosePhotoCrop,
  readPhoto,
  reservePhoto,
  uploadPhotoContent,
} from "../src/media/media-http";

const mediaId = "019d6abc-1234-7234-8234-123456789020";
const sessionId = "019d6abc-1234-7234-8234-123456789021";
const merchantId = "019d6abc-1234-7234-8234-123456789022";
const signal = new AbortController().signal;
const privateRequest = { cache: "no-store", credentials: "same-origin", redirect: "error" };
const awaitingUpload = { mediaId, sessionId, kind: "item", status: "awaiting_upload" };
const awaitingCrop = { ...awaitingUpload, status: "awaiting_crop", width: 1280, height: 960 };
const crop = { focalX: 5_000, focalY: 4_000, zoomPercent: 150 };

function problem(status: number, code: string) {
  return Response.json(
    { type: "about:blank", title: "Problem", status, code, requestId: "r" },
    {
      status,
    },
  );
}

afterEach(() => vi.unstubAllGlobals());

test("[MER-14] reserves a restaurant photo with the session and idempotency headers", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(awaitingUpload, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const input = { kind: "item", merchantId, contentType: "image/png", bytes: 16 } as const;

  await expect(
    reservePhoto({ input, sessionId, idempotencyKey: "photo-key", signal }),
  ).resolves.toEqual({ kind: "ready", data: awaitingUpload });
  expect(fetch).toHaveBeenCalledWith("/v1/media/uploads", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "photo-key",
      "x-expected-session-id": sessionId,
    },
    body: JSON.stringify(input),
    ...privateRequest,
  });
});

test("[MER-14] streams the file as octet-stream and reads the status and crop results", async () => {
  const preparing = { ...awaitingUpload, status: "preparing" };
  const processing = { ...awaitingUpload, status: "processing" };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preparing, { status: 202 }))
    .mockResolvedValueOnce(Response.json(awaitingCrop))
    .mockResolvedValueOnce(Response.json(processing, { status: 202 }));
  vi.stubGlobal("fetch", fetch);
  const file = new Blob([new Uint8Array(16)], { type: "image/png" });

  await expect(uploadPhotoContent({ mediaId, sessionId, file, signal })).resolves.toEqual({
    kind: "ready",
    data: preparing,
  });
  await expect(readPhoto({ mediaId, sessionId, signal })).resolves.toEqual({
    kind: "ready",
    data: awaitingCrop,
  });
  await expect(choosePhotoCrop({ mediaId, sessionId, crop, signal })).resolves.toEqual({
    kind: "ready",
    data: processing,
  });
  expect(fetch.mock.calls).toEqual([
    [
      `/v1/media/uploads/${mediaId}/content`,
      {
        method: "PUT",
        signal,
        headers: { "Content-Type": "application/octet-stream", "x-expected-session-id": sessionId },
        body: file,
        ...privateRequest,
      },
    ],
    [`/v1/media/${mediaId}`, { method: "GET", signal, ...privateRequest }],
    [
      `/v1/media/${mediaId}/crop`,
      {
        method: "PUT",
        signal,
        headers: { "Content-Type": "application/json", "x-expected-session-id": sessionId },
        body: JSON.stringify(crop),
        ...privateRequest,
      },
    ],
  ]);
});

test("[MER-14] classifies every photo problem the API can return", async () => {
  const cases = [
    [new Response(null, { status: 401 }), { kind: "sign-in" }],
    [new Response(null, { status: 403 }), { kind: "forbidden" }],
    [new Response(null, { status: 404 }), { kind: "forbidden" }],
    [new Response(null, { status: 413 }), { kind: "too-large" }],
    [new Response(null, { status: 415 }), { kind: "unsupported-type" }],
    [problem(409, "session_changed"), { kind: "session-changed" }],
    [problem(409, "idempotency_conflict"), { kind: "idempotency-conflict" }],
    [problem(409, "content_mismatch"), { kind: "content-mismatch" }],
    [problem(409, "upload_conflict"), { kind: "upload-conflict" }],
    [problem(409, "crop_conflict"), { kind: "crop-conflict" }],
    [problem(409, "crop_unavailable"), { kind: "crop-unavailable" }],
    [problem(409, "unknown_code"), { kind: "error", shouldRetry: false }],
    [new Response(null, { status: 429 }), { kind: "rate-limited", shouldRetry: true }],
    [new Response(null, { status: 503 }), { kind: "error", shouldRetry: true }],
  ] as const;
  const fetch = vi.fn();
  for (const [response] of cases) fetch.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetch);

  for (const [, expected] of cases) {
    await expect(choosePhotoCrop({ mediaId, sessionId, crop, signal })).resolves.toEqual(expected);
  }
});

test("[MER-14] refuses a response for another session, another photo or a broken body", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...awaitingCrop, sessionId: merchantId }))
      .mockResolvedValueOnce(Response.json({ ...awaitingCrop, mediaId: merchantId }))
      .mockResolvedValueOnce(Response.json({ ...awaitingCrop, status: "ready" }))
      .mockRejectedValueOnce(new TypeError("offline")),
  );

  await expect(readPhoto({ mediaId, sessionId, signal })).resolves.toEqual({
    kind: "session-changed",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(readPhoto({ mediaId, sessionId, signal })).resolves.toEqual({
      kind: "error",
      shouldRetry: true,
    });
  }
});
