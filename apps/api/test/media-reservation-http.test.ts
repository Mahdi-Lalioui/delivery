import { createHash } from "node:crypto";
import { mediaOutput } from "@zaafran/contracts/media";
import type { createMediaRepository } from "@zaafran/db/media";
import type { MediaStore } from "@zaafran/media";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMediaRepository>;

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
    findPreview: vi.fn<Repository["findPreview"]>(),
    findUpload: vi.fn<Repository["findUpload"]>(),
    acceptUpload: vi.fn<Repository["acceptUpload"]>(),
    acceptCrop: vi.fn<Repository["acceptCrop"]>(),
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
  return { api, repository };
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
