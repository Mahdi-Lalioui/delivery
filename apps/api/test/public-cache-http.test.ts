import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { PublicFeedServices } from "../src/public-feed-routes.ts";
import type { PublicRestaurantServices } from "../src/public-restaurant-routes.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";
const slug = "table-fictive";
const revision = 7;
const feedPath = "/v1/feed";
const profilePath = `/v1/merchants/${slug}`;
const categoryPath = `${profilePath}/categories/${id}/items?limit=2`;
const detailPath = `${profilePath}/items/${id}?expectedRevision=${String(revision)}`;
const before = new Date("2026-11-08T17:59:00.000Z");
const opening = new Date("2026-11-08T18:00:00.000Z");

function restaurant(isOpen: boolean) {
  return {
    merchantId: id,
    slug,
    name: "Restaurant fictif",
    cuisines: ["algerian"],
    communeId: id,
    coverMediaId: null,
    logoMediaId: null,
    isOpen,
    nextOpensAt: isOpen ? null : opening.toISOString(),
  };
}

function dish(isAvailable: boolean) {
  return {
    itemId: id,
    names: { fr: "Chawarma" },
    descriptions: { fr: "Grillade maison" },
    priceDzd: 500,
    photoId: null,
    tags: [],
    isAvailable,
  };
}

function setup() {
  let clock = before;
  const now = () => clock;
  const feed = {
    list: vi
      .fn<PublicFeedServices["repository"]["list"]>()
      .mockImplementation(({ now: at }) =>
        Promise.resolve({ restaurants: [restaurant(at >= opening)], nextCursor: null }),
      ),
    readPhoto: vi.fn<PublicFeedServices["repository"]["readPhoto"]>(),
  };
  const menu = {
    read: vi
      .fn<PublicRestaurantServices["repository"]["read"]>()
      .mockImplementation(({ now: at }) =>
        Promise.resolve({
          kind: "found",
          restaurant: {
            ...restaurant(at >= opening),
            pausedUntil: null,
            hours: {
              weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] })),
              specialDates: [],
            },
          },
          revision,
          categories: [],
        }),
      ),
    list: vi
      .fn<PublicRestaurantServices["repository"]["list"]>()
      .mockImplementation(({ now: at }) =>
        Promise.resolve({
          kind: "listed",
          revision,
          items: [dish(at >= opening)],
          nextCursor: null,
        }),
      ),
    detail: vi
      .fn<PublicRestaurantServices["repository"]["detail"]>()
      .mockImplementation(({ now: at }) =>
        Promise.resolve({
          kind: "found",
          revision,
          item: dish(at >= opening),
          optionGroups: [],
        }),
      ),
  };
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    publicFeed: { repository: feed, store: { get: vi.fn() }, now },
    publicRestaurant: { repository: menu, now },
  });
  onTestFinished(() => api.close());
  return {
    api,
    menu,
    reachOpening() {
      clock = opening;
    },
  };
}

const routes = [
  ["[CUS-04:http] feed", feedPath],
  ["[CUS-07:http] profile", profilePath],
  ["[CUS-07:http] category", categoryPath],
  ["[CUS-08:http] detail", detailPath],
] as const;

test.each(routes)("%s allows private revalidation with a bodyless 304", async (_name, url) => {
  const { api } = setup();
  const initial = await api.inject(url);
  expect(initial.statusCode).toBe(200);
  expect(initial.headers["cache-control"]).toBe("private, no-cache");
  const tag = String(initial.headers.etag);
  expect(tag).toMatch(/^W\/"[^"]+"$/u);

  for (const validator of [tag, '"earlier", ' + tag.slice(2), "*"]) {
    const matching = await api.inject({ url, headers: { "if-none-match": validator } });
    expect(matching.statusCode).toBe(304);
    expect(matching.headers).toMatchObject({ etag: tag, "cache-control": "private, no-cache" });
    expect(matching.body).toBe("");
  }

  const unmatched = await api.inject({ url, headers: { "if-none-match": '"older"' } });
  expect(unmatched.statusCode).toBe(200);
  expect(unmatched.headers.etag).toBe(tag);
  expect(unmatched.json()).toEqual(initial.json());
});

test.each([
  [routes[0][0], feedPath, { restaurants: [{ isOpen: true, nextOpensAt: null }] }],
  [routes[1][0], profilePath, { revision, restaurant: { isOpen: true, nextOpensAt: null } }],
  [routes[2][0], categoryPath, { revision, items: [{ isAvailable: true }] }],
  [routes[3][0], detailPath, { revision, item: { isAvailable: true } }],
] as const)("%s changes its validator when time changes availability", async (_name, url, body) => {
  const harness = setup();
  const initial = await harness.api.inject(url);
  expect(initial.statusCode).toBe(200);
  harness.reachOpening();

  const refreshed = await harness.api.inject({
    url,
    headers: { "if-none-match": String(initial.headers.etag) },
  });
  expect(refreshed.statusCode).toBe(200);
  expect(refreshed.json()).toMatchObject(body);
  expect(refreshed.headers.etag).toEqual(expect.any(String));
  expect(refreshed.headers.etag).not.toBe(initial.headers.etag);
});

test.each([
  ["[CUS-07:http] missing profile", profilePath, { read: "read", kind: "not_found", status: 404 }],
  ["[CUS-08:http] moderated item", detailPath, { read: "detail", kind: "not_found", status: 404 }],
  [
    "[CUS-07:http] stale category",
    categoryPath,
    { read: "list", kind: "revision_conflict", status: 409 },
  ],
  [
    "[CUS-08:http] stale detail",
    detailPath,
    { read: "detail", kind: "revision_conflict", status: 409 },
  ],
] as const)(
  "%s takes precedence over an ETag match",
  async (_name, url, { read, kind, status }) => {
    const { api, menu } = setup();
    const initial = await api.inject(url);
    expect(initial.statusCode).toBe(200);
    menu[read].mockResolvedValue({ kind });

    const removed = await api.inject({
      url,
      headers: { "if-none-match": String(initial.headers.etag) },
    });
    expect(removed.statusCode).toBe(status);
    expect(removed.headers["cache-control"]).toBe("no-store");
    expect(removed.headers.etag).toBeUndefined();
    expect(removed.json()).toMatchObject({ code: kind });
  },
);
