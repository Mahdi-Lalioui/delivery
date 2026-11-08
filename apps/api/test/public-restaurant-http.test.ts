import { Readable } from "node:stream";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { PublicRestaurantServices } from "../src/public-restaurant-routes.ts";

const now = new Date("2026-11-08T19:00:00.000Z");
const id = "01932f18-3150-7c33-8a7a-53acfd343001";

test("[CUS-07:http] anonymous category lookup preserves revision conflicts", async () => {
  const repository = {
    read: vi.fn<PublicRestaurantServices["repository"]["read"]>(),
    list: vi.fn<PublicRestaurantServices["repository"]["list"]>(),
    detail: vi.fn<PublicRestaurantServices["repository"]["detail"]>(),
  };
  repository.list.mockResolvedValue({ kind: "revision_conflict" });
  repository.detail.mockResolvedValue({ kind: "not_found" });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    publicRestaurant: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  const response = await api.inject(`/v1/merchants/table-fictive/categories/${id}/items?limit=2`);
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({ code: "revision_conflict" });
  expect(repository.list).toHaveBeenCalledExactlyOnceWith({
    slug: "table-fictive",
    categoryId: id,
    limit: 2,
    now,
  });
  const hidden = await api.inject(`/v1/merchants/table-fictive/items/${id}?expectedRevision=0`);
  expect(hidden.statusCode).toBe(404);
});

test("[CUS-08:http] denies detached item photos before reading storage", async () => {
  const readPhoto = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    publicRestaurantPhotos: { readPhoto, store: { get } },
  });
  onTestFinished(() => api.close());
  const response = await api.inject(
    `/v1/merchants/${id}/items/${id}/photos/${id}/variants/webp/640`,
  );
  expect(response.statusCode).toBe(404);
  expect(readPhoto).toHaveBeenCalledOnce();
  expect(get).not.toHaveBeenCalled();
  readPhoto.mockResolvedValue({ key: "fixture/item.webp" });
  get.mockResolvedValue({ body: Readable.from(Buffer.from("item")), bytes: 4 });
  const visible = await api.inject(
    `/v1/merchants/${id}/items/${id}/photos/${id}/variants/webp/640`,
  );
  expect(visible.statusCode).toBe(200);
  expect(visible.headers).toMatchObject({
    "content-type": "image/webp",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  expect(visible.rawPayload).toEqual(Buffer.from("item"));
  expect(get).toHaveBeenCalledExactlyOnceWith("fixture/item.webp");
});
