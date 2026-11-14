import { Readable } from "node:stream";
import type { createMerchantRepository } from "@zaafran/db/merchant";
import type { MediaStore } from "@zaafran/media";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMerchantRepository>;

const adminId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const merchantId = "019d6abc-1234-7234-8234-123456789002";
const mediaId = "019d6abc-1234-7234-8234-123456789003";
const admin = { accountId: adminId, sessionId, role: "admin" } as const;
const storageKey = `private/${mediaId}/640.webp`;
const image = Buffer.from("RIFF fixture application photo");
const url = `/v1/admin/merchant-applications/${merchantId.toUpperCase()}/photos/${mediaId.toUpperCase()}/640`;

function setup(authenticated: Actor | undefined) {
  const findApplicationPhotoVariant = vi
    .fn<Repository["findApplicationPhotoVariant"]>()
    .mockResolvedValue({ storageKey });
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
    applicationPhoto: { repository: { findApplicationPhotoVariant }, store },
  });
  onTestFinished(() => api.close());
  return { api, findApplicationPhotoVariant, store };
}

test("[MER-01:http] streams an application photo variant to an admin without caching", async () => {
  const { api, findApplicationPhotoVariant, store } = setup(admin);
  const result = await api.inject({ url });
  expect(result.statusCode).toBe(200);
  expect(result.headers["content-type"]).toBe("image/webp");
  expect(result.headers["content-length"]).toBe(image.length.toString());
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.rawPayload).toEqual(image);
  expect(findApplicationPhotoVariant).toHaveBeenCalledExactlyOnceWith({
    adminUserId: adminId,
    merchantId,
    mediaId,
    width: 640,
  });
  expect(store.get).toHaveBeenCalledExactlyOnceWith(storageKey);
});

test("[MER-01:http] conceals an unattached, unready or missing application photo", async () => {
  const { api, findApplicationPhotoVariant, store } = setup(admin);
  findApplicationPhotoVariant.mockResolvedValueOnce(undefined);
  const hidden = await api.inject({ url });
  expect(hidden.statusCode).toBe(404);
  expect(hidden.headers["cache-control"]).toBe("no-store");
  expect(store.get).not.toHaveBeenCalled();

  store.get.mockResolvedValueOnce(undefined);
  expect((await api.inject({ url })).statusCode).toBe(404);
  expect(findApplicationPhotoVariant).toHaveBeenCalledTimes(2);
});

test.each(["/700", "/0640", "/not-a-width"])(
  "[MER-01:http] rejects the unpublished width %s before reading",
  async (suffix) => {
    const { api, findApplicationPhotoVariant } = setup(admin);
    const result = await api.inject({ url: url.replace(/\/640$/, suffix) });
    expect(result.statusCode).toBe(400);
    expect(findApplicationPhotoVariant).not.toHaveBeenCalled();
  },
);

test.each([
  { role: "anonymous", actor: undefined, status: 401 },
  { role: "customer", actor: { ...admin, role: "customer" } as const, status: 403 },
  { role: "merchant owner", actor: { ...admin, role: "merchant_owner" } as const, status: 403 },
])("[MER-01:http] refuses the $role", async ({ actor, status }) => {
  const { api, findApplicationPhotoVariant } = setup(actor);
  expect((await api.inject({ url })).statusCode).toBe(status);
  expect(findApplicationPhotoVariant).not.toHaveBeenCalled();
});

test("[MER-01:http] reports an unavailable photo service", async () => {
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(admin),
  });
  onTestFinished(() => api.close());
  expect((await api.inject({ url })).statusCode).toBe(503);
});
