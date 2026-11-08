import { afterEach, expect, test, vi } from "vitest";
import {
  makeProfilePhotosAttempt,
  readProfilePhotos,
  saveProfilePhotos,
} from "../src/merchant-profile-photos/merchant-profile-photos-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const coverPhotoId = "019d6abc-1234-7234-8234-123456789002";
const logoPhotoId = "019d6abc-1234-7234-8234-123456789003";
const snapshot = {
  sessionId,
  revision: 4,
  restaurantName: "Restaurant",
  coverPhotoId: null,
  logoPhotoId: null,
};
const photos = { coverPhotoId, logoPhotoId };
const signal = new AbortController().signal;
const endpoint = `/v1/merchants/${merchantId}/profile/photos`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("[MER-14] reads the private restaurant profile photo snapshot", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(snapshot));
  vi.stubGlobal("fetch", fetch);

  await expect(readProfilePhotos({ merchantId, signal })).resolves.toEqual({
    kind: "ready",
    data: snapshot,
  });
  expect(fetch).toHaveBeenCalledWith(endpoint, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test("[MER-14] saves both ready photo IDs in one exact revision and retries the identical command", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockRejectedValueOnce(new TypeError("Lost response"))
    .mockResolvedValueOnce(Response.json({ ...snapshot, ...photos, revision: 5 }));
  vi.stubGlobal("fetch", fetch);

  const attempt = makeProfilePhotosAttempt(snapshot, photos);
  await expect(saveProfilePhotos({ merchantId, attempt, signal })).resolves.toEqual({
    kind: "error",
    retry: true,
  });
  const retry = makeProfilePhotosAttempt(snapshot, photos, attempt);
  await expect(saveProfilePhotos({ merchantId, attempt: retry, signal })).resolves.toMatchObject({
    kind: "saved",
    data: { ...photos, revision: 5 },
  });

  expect(fetch).toHaveBeenCalledTimes(2);
  const [path, { signal: firstSignal, ...options } = {}] = fetch.mock.calls[0] ?? [];
  const [retryPath, { signal: retrySignal, ...retryOptions } = {}] = fetch.mock.calls[1] ?? [];
  expect(options.method).toBe("PUT");
  expect(options.headers).toMatchObject({
    "x-expected-session-id": sessionId,
    "Idempotency-Key": attempt.key,
  });
  expect(options.body).toBe(JSON.stringify({ ...photos, expectedRevision: 4 }));
  expect(retryPath).toBe(path);
  expect(retryOptions).toEqual(options);
  expect(retrySignal).toBeInstanceOf(AbortSignal);
  expect(retrySignal).not.toBe(firstSignal);
  expect(makeProfilePhotosAttempt(snapshot, { ...photos, coverPhotoId: null }, retry).key).not.toBe(
    attempt.key,
  );
});

test.each([
  [{ sessionId: "019d6abc-1234-7234-8234-123456789004", revision: 5 }, "session-changed"],
  [{ revision: 4 }, "error"],
  [{ revision: 5, logoPhotoId: null }, "error"],
])("[MER-14] rejects an inconsistent save receipt (%s)", async (patch, kind) => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ...snapshot, ...photos, ...patch }));
  vi.stubGlobal("fetch", fetch);
  const attempt = makeProfilePhotosAttempt(snapshot, photos);
  await expect(saveProfilePhotos({ merchantId, attempt, signal })).resolves.toMatchObject({ kind });
});

test.each([
  ["session_changed", "session-changed"],
  ["revision_conflict", "revision-conflict"],
  ["photos_unavailable", "photos-unavailable"],
])("[MER-14] distinguishes a rejected %s save", async (code, kind) => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json(
      {
        type: "https://example.test/problem",
        status: 409,
        title: "Conflict",
        requestId: "test",
        code,
      },
      { status: 409 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const attempt = makeProfilePhotosAttempt(snapshot, photos);
  await expect(saveProfilePhotos({ merchantId, attempt, signal })).resolves.toEqual({ kind });
});

test.each(["deadline", "navigation"] as const)(
  "[MER-14] a stalled save releases its request on %s and can replay the same key",
  async (cause) => {
    const deadline = new AbortController();
    const lifecycle = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce((_, init) => {
        const pending = Promise.withResolvers<Response>();
        init?.signal?.addEventListener(
          "abort",
          () => {
            pending.reject(new DOMException("Request aborted", "AbortError"));
          },
          { once: true },
        );
        return pending.promise;
      })
      .mockResolvedValueOnce(Response.json({ ...snapshot, ...photos, revision: 5 }));
    vi.stubGlobal("fetch", fetch);

    const attempt = makeProfilePhotosAttempt(snapshot, photos);
    const stalled = saveProfilePhotos({ merchantId, attempt, signal: lifecycle.signal });
    expect(timeout).toHaveBeenCalledWith(15_000);
    (cause === "deadline" ? deadline : lifecycle).abort();
    await expect(stalled).resolves.toEqual({ kind: "error", retry: true });

    timeout.mockRestore();
    const retry = makeProfilePhotosAttempt(snapshot, photos, attempt);
    await expect(saveProfilePhotos({ merchantId, attempt: retry, signal })).resolves.toMatchObject({
      kind: "saved",
    });
    expect(fetch.mock.calls[1]?.[1]?.headers).toEqual(fetch.mock.calls[0]?.[1]?.headers);
    expect(fetch.mock.calls[1]?.[1]?.body).toBe(fetch.mock.calls[0]?.[1]?.body);
  },
);
