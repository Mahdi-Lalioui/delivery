import { mediaOutput } from "@zaafran/contracts/media";
import type { createMediaRepository } from "@zaafran/db/media";
import type { MediaStore } from "@zaafran/media";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMediaRepository>;

const accountId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const mediaId = "019d6abc-1234-7234-8234-123456789003";
const now = new Date("2026-11-13T06:00:00.000Z");
const actor = { accountId, sessionId, role: "merchant_owner" } as const;
const crop = { focalX: 2500, focalY: 7500, zoomPercent: 150 };
const processing = { mediaId, sessionId, kind: "item", status: "processing" } as const;
const request = {
  method: "PUT",
  url: `/v1/media/${mediaId.toUpperCase()}/crop`,
  headers: { "x-expected-session-id": sessionId },
  payload: crop,
} as const;

function setup(authenticated: Actor | undefined) {
  const repository = {
    reserve: vi.fn<Repository["reserve"]>(),
    read: vi.fn<Repository["read"]>(),
    findUpload: vi.fn<Repository["findUpload"]>(),
    acceptUpload: vi.fn<Repository["acceptUpload"]>(),
    acceptCrop: vi
      .fn<Repository["acceptCrop"]>()
      .mockResolvedValue({ kind: "accepted", media: processing }),
  } satisfies Repository;
  const store = {
    put: vi.fn<MediaStore["put"]>(),
    get: vi.fn<MediaStore["get"]>(),
    delete: vi.fn<MediaStore["delete"]>(),
  } satisfies MediaStore;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(authenticated),
    media: { repository, store, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-14:http] accepts the owner's crop and reports the processing photo", async () => {
  const { api, repository } = setup(actor);
  for (const kind of ["accepted", "replayed"] as const) {
    repository.acceptCrop.mockResolvedValueOnce({ kind, media: processing });
    const result = await api.inject(request);
    expect(result.statusCode).toBe(202);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(mediaOutput.parse(result.json())).toEqual(processing);
  }
  expect(repository.acceptCrop).toHaveBeenCalledWith({ accountId, sessionId, mediaId, now, crop });
});

test("[MER-14:http] rejects an out-of-range crop or a stale session before writing", async () => {
  const { api, repository } = setup(actor);
  for (const change of [
    { focalX: 10_001 },
    { focalY: -1 },
    { zoomPercent: 99 },
    { zoomPercent: 401 },
    { zoomPercent: 150.5 },
    { previewKey: "media/private" },
  ]) {
    const result = await api.inject({ ...request, payload: { ...crop, ...change } });
    expect(result.statusCode, JSON.stringify(change)).toBe(400);
  }
  const stale = await api.inject({ ...request, headers: { "x-expected-session-id": mediaId } });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "session_changed" });
  expect(repository.acceptCrop).not.toHaveBeenCalled();
});

test("[MER-14:http] maps an unavailable, conflicting or foreign crop to a problem", async () => {
  const { api, repository } = setup(actor);
  for (const [kind, status] of [
    ["crop_unavailable", 409],
    ["crop_conflict", 409],
    ["not_found", 404],
  ] as const) {
    repository.acceptCrop.mockResolvedValueOnce({ kind });
    const result = await api.inject(request);
    expect(result.statusCode).toBe(status);
    expect(result.json()).toMatchObject({ code: kind });
  }
});

test.each([
  { role: "anonymous", status: 401 },
  { role: "admin", status: 403 },
] as const)("[MER-14:authz] denies $role on the crop command", async ({ role, status }) => {
  const { api, repository } = setup(role === "anonymous" ? undefined : { ...actor, role });
  expect((await api.inject(request)).statusCode).toBe(status);
  expect(repository.acceptCrop).not.toHaveBeenCalled();
});
