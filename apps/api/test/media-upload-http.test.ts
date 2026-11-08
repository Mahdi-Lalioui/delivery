import { createHash } from "node:crypto";
import { buffer } from "node:stream/consumers";
import { mediaOutput, photoUploadMaximumBytes } from "@zaafran/contracts/media";
import type { createMediaRepository } from "@zaafran/db/media";
import type { MediaStore } from "@zaafran/media";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMediaRepository>;

const accountId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const mediaId = "019d6abc-1234-7234-8234-123456789003";
const now = new Date("2026-11-07T12:00:00.000Z");
const actor = { accountId, sessionId, role: "customer" } as const;
const result = { mediaId, sessionId, kind: "application", status: "preparing" } as const;
const descriptor = { contentType: "image/png", bytes: 4 } as const;
const path = `/v1/media/uploads/${mediaId}/content`;
const headers = { "x-expected-session-id": sessionId, "content-type": "application/octet-stream" };
const upload = { method: "PUT", url: path, headers, payload: Buffer.from("test") } as const;

function setup(authenticated: Actor | undefined = actor) {
  const repository = {
    reserve: vi.fn<Repository["reserve"]>(),
    read: vi.fn<Repository["read"]>(),
    findUpload: vi.fn<Repository["findUpload"]>().mockResolvedValue(descriptor),
    acceptUpload: vi
      .fn<Repository["acceptUpload"]>()
      .mockResolvedValue({ kind: "accepted", media: result }),
  } satisfies Repository;
  const store = {
    put: vi.fn<MediaStore["put"]>().mockResolvedValue("stored"),
    get: vi.fn<MediaStore["get"]>(),
    delete: vi.fn<MediaStore["delete"]>().mockResolvedValue(undefined),
  } satisfies MediaStore;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(authenticated),
    media: { repository, store, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository, store };
}

test("[MER-14:http] streams a binary upload above the JSON ceiling and adopts its exact digest", async () => {
  const { api, repository, store } = setup();
  const payload = Buffer.alloc(300 * 1024, 11);
  const digest = createHash("sha256").update(payload).digest();
  repository.findUpload.mockResolvedValue({ ...descriptor, bytes: payload.length });
  store.put.mockImplementation(async ({ body, bytes, checksumSha256 }) => {
    const content = await buffer(body);
    expect(content).toEqual(payload);
    expect(bytes).toBe(payload.length);
    expect(checksumSha256).toBe(digest.toString("base64"));
    return "stored";
  });

  const response = await api.inject({ ...upload, payload });
  expect(response.statusCode).toBe(202);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(mediaOutput.parse(response.json())).toEqual(result);
  expect(repository.findUpload).toHaveBeenCalledExactlyOnceWith({
    accountId,
    sessionId,
    mediaId,
    now,
  });
  expect(repository.acceptUpload).toHaveBeenCalledOnce();
  const [acceptedCall] = repository.acceptUpload.mock.calls;
  const accepted = acceptedCall?.[0];
  expect(accepted).toMatchObject({
    accountId,
    sessionId,
    mediaId,
    now,
    contentType: descriptor.contentType,
    bytes: payload.length,
    digest,
  });
  expect(accepted?.quarantineKey).toMatch(new RegExp(`^quarantine/${mediaId}/[a-f0-9-]{36}$`));
  expect(store.delete).not.toHaveBeenCalled();
});

test("[MER-14:authz] rejects a changed session and foreign reservation before storage", async () => {
  const { api, repository, store } = setup();
  const stale = await api.inject({
    ...upload,
    headers: { ...headers, "x-expected-session-id": mediaId },
  });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "session_changed" });
  expect(repository.findUpload).not.toHaveBeenCalled();
  repository.findUpload.mockResolvedValue(undefined);
  expect((await api.inject(upload)).statusCode).toBe(404);
  expect(store.put).not.toHaveBeenCalled();
});

test("[MER-14:http] rejects unexpected MIME and encoding, declared oversize and wrong length", async () => {
  const { api, repository, store } = setup();
  const wrongMime = await api.inject({
    ...upload,
    headers: { ...headers, "content-type": "application/json" },
  });
  expect(wrongMime.statusCode).toBe(415);
  expect(
    (await api.inject({ ...upload, headers: { ...headers, "content-encoding": "gzip" } }))
      .statusCode,
  ).toBe(415);
  expect(
    (
      await api.inject({
        ...upload,
        headers: { ...headers, "content-length": String(photoUploadMaximumBytes + 1) },
      })
    ).statusCode,
  ).toBe(413);
  expect((await api.inject({ ...upload, payload: Buffer.from("bad") })).statusCode).toBe(400);
  expect(store.put).not.toHaveBeenCalled();
  expect(repository.acceptUpload).not.toHaveBeenCalled();
});

test("[MER-14:http] removes only a known replay or rejected candidate after adoption", async () => {
  const { api, repository, store } = setup();
  repository.acceptUpload.mockResolvedValueOnce({ kind: "replayed", media: result });
  expect((await api.inject(upload)).statusCode).toBe(202);
  const [firstCall] = store.put.mock.calls;
  const firstInput = firstCall?.[0];
  const first = firstInput?.key;
  expect(first).toBeDefined();
  expect(store.delete).toHaveBeenCalledExactlyOnceWith(first);

  repository.acceptUpload.mockRejectedValueOnce(new Error("Unknown commit outcome"));
  expect((await api.inject(upload)).statusCode).toBe(500);
  expect(store.delete).toHaveBeenCalledTimes(1);
});
