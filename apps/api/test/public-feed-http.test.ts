import { Readable } from "node:stream";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { PublicFeedServices } from "../src/public-feed-routes.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";
const photo = "01932f18-3150-7c33-8a7a-53acfd343002";
const photoUrl = `/v1/merchants/${id}/profile/photos/${photo}/variants/webp/320`;
const now = new Date("2026-11-08T17:00:00.000Z");
const emptyPage = { restaurants: [], nextCursor: null };

function setup() {
  const list = vi.fn<PublicFeedServices["repository"]["list"]>().mockResolvedValue(emptyPage);
  const readPhoto = vi.fn<PublicFeedServices["repository"]["readPhoto"]>();
  const get = vi.fn<PublicFeedServices["store"]["get"]>();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    publicFeed: { repository: { list, readPhoto }, store: { get }, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, list, readPhoto, get };
}

test("[CUS-01:http] anonymously lists a bounded page without location parameters", async () => {
  const { api, list } = setup();
  const response = await api.inject("/v1/feed?limit=2&cursor=" + id.toUpperCase());
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-cache");
  expect(response.json()).toEqual(emptyPage);
  expect(list).toHaveBeenCalledExactlyOnceWith({ limit: 2, cursor: id, now });
  expect((await api.inject("/v1/feed?longitude=3.05")).statusCode).toBe(400);
});

test("[CUS-04:http] streams only repository-authorized current profile variants", async () => {
  const { api, readPhoto, get } = setup();
  expect((await api.inject(photoUrl)).statusCode).toBe(404);
  expect(get).not.toHaveBeenCalled();
  readPhoto.mockResolvedValue({ key: "fixture/profile/cover.webp" });
  get.mockResolvedValue({ bytes: 3, body: Readable.from(Buffer.from("img")) });
  const result = await api.inject(photoUrl);
  expect(result.statusCode).toBe(200);
  expect(result.headers).toMatchObject({
    "content-type": "image/webp",
    "content-length": "3",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  });
  expect(result.rawPayload).toEqual(Buffer.from("img"));
  expect(readPhoto).toHaveBeenLastCalledWith({
    merchantId: id,
    mediaId: photo,
    format: "webp",
    width: 320,
  });
  expect(get).toHaveBeenCalledExactlyOnceWith("fixture/profile/cover.webp");
  expect((await api.inject(photoUrl.replace(/320$/u, "321"))).statusCode).toBe(400);
});

test("[CUS-06:http] sends validated URL filters and sorting to the repository", async () => {
  const { api, list } = setup();
  const response = await api.inject(
    "/v1/feed?cuisine=algerian&openNow=true&freeDelivery=true&maxEtaMinutes=30&priceLevel=2&sort=eta",
  );
  expect(response.statusCode).toBe(200);
  expect(list).toHaveBeenCalledExactlyOnceWith({
    limit: 24,
    cuisine: "algerian",
    openNow: true,
    freeDelivery: true,
    maxEtaMinutes: 30,
    priceLevel: 2,
    sort: "eta",
    now,
  });
});
