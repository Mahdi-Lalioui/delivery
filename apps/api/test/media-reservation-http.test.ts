import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mediaOutput } from "@zaafran/contracts/media";
import type { MediaStore } from "@zaafran/media";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { MediaReservationServices } from "../src/media-reservation-routes.ts";
import type { Actor } from "../src/policy.ts";

type Repository = MediaReservationServices["repository"];

const accountId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const merchantId = "019d6abc-1234-7234-8234-123456789002";
const mediaId = "019d6abc-1234-7234-8234-123456789003";
const now = new Date("2026-11-07T12:00:00.000Z");
const key = "fixture-media-reserve-command";
const actor = { accountId, sessionId, role: "customer" } as const;
const payload = { contentType: "image/heic", bytes: 8 * 1024 * 1024, kind: "item", merchantId };
const headers = { "idempotency-key": key, "x-expected-session-id": sessionId };
const reserve = { method: "POST", url: "/v1/media/uploads", payload, headers } as const;
const read = `/v1/media/${mediaId}`;
const reservation = { kind: "item", status: "awaiting_upload", sessionId, mediaId } as const;

function setup(authenticated?: Actor) {
  const repository = {
    reserve: vi.fn<Repository["reserve"]>(),
    read: vi.fn<Repository["read"]>(),
    findVariant: vi.fn<Repository["findVariant"]>(),
    findPreview: vi.fn<Repository["findPreview"]>(),
    findUpload: vi.fn<Repository["findUpload"]>(),
    submitCrop: vi.fn<Repository["submitCrop"]>(),
    acceptUpload: vi.fn<Repository["acceptUpload"]>(),
  } satisfies Repository;
  const store = {
    put: vi.fn<MediaStore["put"]>(),
    get: vi.fn<MediaStore["get"]>(),
    delete: vi.fn<MediaStore["delete"]>(),
  } satisfies MediaStore;
  const options = {
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(authenticated),
    media: { repository, store, now: () => now },
  };
  const api = createApi(options);
  onTestFinished(() => api.close());
  return { api, repository, store };
}

test("[MER-14:http] reserves an authorized merchant photo with a bounded strict body", async () => {
  const { api, repository } = setup(actor);
  repository.reserve.mockResolvedValue({ kind: "created", media: reservation });
  const result = await api.inject({
    ...reserve,
    payload: { ...payload, merchantId: merchantId.toUpperCase() },
  });
  expect(result.statusCode).toBe(201);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(mediaOutput.parse(result.json())).toEqual(reservation);
  expect(repository.reserve).toHaveBeenCalledExactlyOnceWith({
    accountId,
    sessionId,
    now,
    input: payload,
    idempotencyKeyHash: createHash("sha256").update(key).digest(),
    requestHash: createHash("sha256").update(JSON.stringify(payload)).digest(),
  });

  for (const change of [
    { bytes: payload.bytes + 1 },
    { contentType: "image/svg+xml" },
    { storageKey: "quarantine/private" },
  ]) {
    expect((await api.inject({ ...reserve, payload: { ...payload, ...change } })).statusCode).toBe(
      400,
    );
  }
  expect(repository.reserve).toHaveBeenCalledTimes(1);
});

test("[MER-14:http] preserves exact reservation replay and rejects stale sessions before writing", async () => {
  const { api, repository } = setup(actor);
  repository.reserve.mockResolvedValue({ kind: "replayed", media: reservation });
  const stale = await api.inject({
    ...reserve,
    headers: { ...headers, "x-expected-session-id": mediaId },
  });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "session_changed" });
  expect(repository.reserve).not.toHaveBeenCalled();

  const replay = await api.inject(reserve);
  expect(replay.statusCode).toBe(201);
  expect(mediaOutput.parse(replay.json())).toEqual(reservation);
  repository.reserve.mockResolvedValue({ kind: "idempotency_conflict" });
  const conflict = await api.inject(reserve);
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toMatchObject({ code: "idempotency_conflict" });
});

test("[MER-14:http] serves a private preparation status and conceals a foreign reservation", async () => {
  const { api, repository } = setup(actor);
  const preparing = { ...reservation, status: "preparing" } as const;
  repository.read.mockResolvedValueOnce(preparing).mockResolvedValueOnce(undefined);
  const ready = await api.inject(read);
  expect(ready.statusCode).toBe(200);
  expect(ready.headers["cache-control"]).toBe("no-store");
  expect(mediaOutput.parse(ready.json())).toEqual(preparing);
  expect(repository.read).toHaveBeenCalledExactlyOnceWith({ accountId, mediaId, sessionId, now });

  const denied = await api.inject(read);
  expect(denied.statusCode).toBe(404);
  expect(denied.headers["cache-control"]).toBe("no-store");
  expect(denied.json()).toMatchObject({ code: "not_found" });
});

test.each([
  { role: "anonymous", status: 401 },
  { role: "admin", status: 403 },
] as const)(
  "[MER-14:authz] denies $role on private upload reservation routes",
  async ({ role, status }) => {
    const { api, repository } = setup(role === "anonymous" ? undefined : { ...actor, role });
    expect((await api.inject(reserve)).statusCode).toBe(status);
    expect((await api.inject(read)).statusCode).toBe(status);
    expect(repository.reserve).not.toHaveBeenCalled();
    expect(repository.read).not.toHaveBeenCalled();
  },
);

test("[MER-14:http] streams only a scoped private WebP preview", async () => {
  const { api, repository, store } = setup(actor);
  const key = "preview/private";
  const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]);
  repository.findPreview.mockResolvedValueOnce(undefined).mockResolvedValue({ key });
  store.get.mockResolvedValueOnce({ body: Readable.from([bytes]), bytes: bytes.length });

  const denied = await api.inject(read + "/preview");
  expect(denied.statusCode).toBe(404);
  expect(store.get).not.toHaveBeenCalled();

  const preview = await api.inject(read + "/preview");
  expect(preview.statusCode).toBe(200);
  expect(preview.headers).toMatchObject({
    "cache-control": "private, no-store",
    "content-type": "image/webp",
    "content-length": String(bytes.length),
    "x-content-type-options": "nosniff",
  });
  expect(preview.rawPayload).toEqual(bytes);
  expect(repository.findPreview).toHaveBeenLastCalledWith({ accountId, mediaId, sessionId, now });

  expect((await api.inject(read + "/preview")).statusCode).toBe(503);
});

test("[MER-14:http] submits a validated crop once under the expected session", async () => {
  const { api, repository } = setup(actor);
  const crop = { focalX: 2500, focalY: 7500, zoomPercent: 150 };
  const request = { method: "POST", url: read + "/crop", headers, payload: crop } as const;
  const media = { ...reservation, status: "processing" } as const;
  repository.submitCrop
    .mockResolvedValueOnce({ kind: "accepted", media })
    .mockResolvedValueOnce({ kind: "replayed", media })
    .mockResolvedValueOnce({ kind: "crop_conflict" })
    .mockResolvedValueOnce({ kind: "idempotency_conflict" })
    .mockResolvedValueOnce({ kind: "not_found" });

  const stale = await api.inject({
    ...request,
    headers: { ...headers, "x-expected-session-id": mediaId },
  });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "session_changed" });
  for (const payload of [
    { ...crop, focalX: -1 },
    { ...crop, zoomPercent: 401 },
    { ...crop, key },
  ]) {
    expect((await api.inject({ ...request, payload })).statusCode).toBe(400);
  }
  expect(repository.submitCrop).not.toHaveBeenCalled();

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await api.inject(request);
    expect(response.statusCode).toBe(202);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mediaOutput.parse(response.json())).toEqual(media);
  }
  expect(repository.submitCrop).toHaveBeenNthCalledWith(1, {
    accountId,
    sessionId,
    mediaId,
    now,
    input: crop,
    idempotencyKeyHash: createHash("sha256").update(key).digest(),
    requestHash: createHash("sha256")
      .update(JSON.stringify({ mediaId, ...crop }))
      .digest(),
  });
  for (const code of ["crop_conflict", "idempotency_conflict"]) {
    const response = await api.inject(request);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code });
  }
  expect((await api.inject(request)).statusCode).toBe(404);
});

test("[MER-14:http] streams only published variants visible to the owner", async () => {
  const { api, repository, store } = setup(actor);
  const bytes = Buffer.from("synthetic avif");
  repository.findVariant.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ key });
  store.get.mockResolvedValueOnce({ body: Readable.from([bytes]), bytes: bytes.length });
  expect((await api.inject(read + "/variants/svg/160")).statusCode).toBe(400);
  expect((await api.inject(read + "/variants/avif/159")).statusCode).toBe(400);
  expect(repository.findVariant).not.toHaveBeenCalled();
  expect((await api.inject(read + "/variants/avif/160")).statusCode).toBe(404);
  expect(store.get).not.toHaveBeenCalled();
  const result = await api.inject(read + "/variants/avif/160");
  expect(result.statusCode).toBe(200);
  expect(result.headers).toMatchObject({
    "cache-control": "private, no-store",
    "content-type": "image/avif",
    "x-content-type-options": "nosniff",
  });
  expect(result.rawPayload).toEqual(bytes);
  expect(repository.findVariant).toHaveBeenLastCalledWith({
    accountId,
    sessionId,
    mediaId,
    now,
    format: "avif",
    width: 160,
  });
});
