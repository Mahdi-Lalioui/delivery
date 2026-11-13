import { Readable } from "node:stream";
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
const previewKey = `media/${mediaId}/preview.webp`;
const image = Buffer.from("RIFF fixture preview");
const url = `/v1/media/${mediaId.toUpperCase()}/preview`;

function setup(authenticated: Actor | undefined) {
  const repository = {
    reserve: vi.fn<Repository["reserve"]>(),
    read: vi.fn<Repository["read"]>(),
    findPreview: vi.fn<Repository["findPreview"]>().mockResolvedValue({ previewKey }),
    findUpload: vi.fn<Repository["findUpload"]>(),
    acceptUpload: vi.fn<Repository["acceptUpload"]>(),
    acceptCrop: vi.fn<Repository["acceptCrop"]>(),
  } satisfies Repository;
  const store = {
    put: vi.fn<MediaStore["put"]>(),
    get: vi
      .fn<MediaStore["get"]>()
      .mockImplementation(() =>
        Promise.resolve({ body: Readable.from([image]), bytes: image.length }),
      ),
    delete: vi.fn<MediaStore["delete"]>(),
  } satisfies MediaStore;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(authenticated),
    media: { repository, store, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository, store };
}

test("[MER-14:http] streams the private crop preview to its owner without caching", async () => {
  const { api, repository, store } = setup(actor);
  const result = await api.inject({ url, headers: {} });
  expect(result.statusCode).toBe(200);
  expect(result.headers["content-type"]).toBe("image/webp");
  expect(result.headers["content-length"]).toBe(image.length.toString());
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.rawPayload).toEqual(image);
  expect(repository.findPreview).toHaveBeenCalledExactlyOnceWith({
    accountId,
    sessionId,
    mediaId,
    now,
  });
  expect(store.get).toHaveBeenCalledExactlyOnceWith(previewKey);
});

test("[MER-14:http] conceals a foreign, unprepared or missing preview", async () => {
  const { api, repository, store } = setup(actor);
  repository.findPreview.mockResolvedValueOnce(undefined);
  const hidden = await api.inject({ url });
  expect(hidden.statusCode).toBe(404);
  expect(hidden.headers["cache-control"]).toBe("no-store");
  expect(store.get).not.toHaveBeenCalled();

  store.get.mockResolvedValueOnce(undefined);
  expect((await api.inject({ url })).statusCode).toBe(404);

  const malformed = await api.inject({ url: "/v1/media/not-a-uuid/preview" });
  expect(malformed.statusCode).toBe(400);
  expect(repository.findPreview).toHaveBeenCalledTimes(2);
});

test.each([
  { role: "anonymous", status: 401 },
  { role: "admin", status: 403 },
] as const)("[MER-14:authz] denies $role on the private preview", async ({ role, status }) => {
  const { api, repository } = setup(role === "anonymous" ? undefined : { ...actor, role });
  expect((await api.inject({ url })).statusCode).toBe(status);
  expect(repository.findPreview).not.toHaveBeenCalled();
});
