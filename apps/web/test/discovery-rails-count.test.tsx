import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { FeedCard } from "../src/discovery/feed-card";
import { filtersFromSearch } from "../src/discovery/filter-state";
import { readPreviewCatalog } from "../src/discovery/preview-catalog-http";

beforeEach(() => {
  vi.stubEnv("ZAAFRAN_PREVIEW_DEMO", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
});

async function previewFeed(query: string) {
  const response = readPreviewCatalog(new Request(`https://awid.test/v1/feed?${query}`));
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("restaurants" in body)) throw new Error("bad body");
  const { restaurants } = body;
  if (!Array.isArray(restaurants)) throw new Error("bad restaurants");
  const total = "totalCount" in body ? body.totalCount : undefined;
  return { restaurants: restaurants.map((card: { slug: string }) => card.slug), total };
}

test("[CUS-04] keeps the vegetarian filter in the address", () => {
  expect(filtersFromSearch("?dietary=vegetarian&dietary2=x")).toEqual({ dietary: "vegetarian" });
  expect(filtersFromSearch("?dietary=vegan")).toEqual({});
});

test("[CUS-04] counts matches only when asked, for Show N restaurants", async () => {
  const counted = await previewFeed("dietary=vegetarian&limit=1&includeCount=true");
  expect(counted.restaurants).toHaveLength(1);
  expect(counted.total).toBe(4);
  expect((await previewFeed("limit=1")).total).toBeUndefined();
});

test("[CUS-04] the New and small-minimum rails list only matching restaurants", async () => {
  expect((await previewFeed("newOnly=true")).restaurants.toSorted()).toEqual([
    "four-demo",
    "msemen-wahran",
    "patisserie-cirta",
  ]);
  expect((await previewFeed("maxMinimumOrderDzd=1000")).restaurants.toSorted()).toEqual([
    "atelier-demo",
    "karantika-bab-el-oued",
    "msemen-wahran",
    "patisserie-cirta",
  ]);
});

test("[CUS-04] badges a restaurant as New only when the feed says so", () => {
  const card = {
    merchantId: "019d6abc-1234-7234-8234-123456789000",
    slug: "nouveau",
    name: "Nouveau",
    cuisines: [],
    communeId: "019d6abc-1234-7234-8234-123456789003",
    coverMediaId: null,
    logoMediaId: null,
    isOpen: true,
    nextOpensAt: null,
  };
  expect(
    renderToStaticMarkup(<FeedCard restaurant={{ ...card, isNew: true }} locale="fr" />),
  ).toContain("restaurant-feed-new");
  expect(renderToStaticMarkup(<FeedCard restaurant={card} locale="fr" />)).not.toContain(
    "restaurant-feed-new",
  );
});
