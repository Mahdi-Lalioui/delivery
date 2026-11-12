import { publicFeedOutput } from "@zaafran/contracts/feed";
import {
  publicRestaurantItemOutput,
  publicRestaurantItemsOutput,
  publicRestaurantOutput,
} from "@zaafran/contracts/restaurant";
import { publicSearchOutput } from "@zaafran/contracts/search";
import { afterEach, assert, beforeEach, expect, test, vi } from "vitest";
import { GET, POST } from "../src/app/v1/[...path]/route";

function request(path: string, method = "GET") {
  return new Request("https://preview.example/v1/" + path, { method });
}

beforeEach(() => {
  vi.stubEnv("ZAAFRAN_PREVIEW_DEMO", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
});

afterEach(() => vi.unstubAllEnvs());

test.each([
  ["unset opt-in", "", "preview"],
  ["a different opt-in value", "true", "preview"],
  ["production", "1", "production"],
])("returns an uncached 404 with %s", (_name, optIn, vercelEnvironment) => {
  vi.stubEnv("ZAAFRAN_PREVIEW_DEMO", optIn);
  vi.stubEnv("VERCEL_ENV", vercelEnvironment);

  const response = GET(request("feed"));
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test.each(["auth/session", "merchants/atelier-sidi-yahia/staff", "orders"])(
  "returns an uncached 404 for %s",
  (path) => {
    const response = GET(request(path));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  },
);

test("rejects mutations with an uncached response", () => {
  const response = POST(request("feed", "POST"));
  expect(response.status).toBe(405);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("[CUS-01] pages through synthetic restaurants using the public feed cursor", async () => {
  const first = publicFeedOutput.parse(await GET(request("feed?limit=1")).json());
  expect(first.restaurants).toHaveLength(1);
  expect(first.restaurants[0]?.slug).toBe("atelier-sidi-yahia");
  expect(first.nextCursor).toEqual(first.restaurants[0]?.merchantId);

  const second = publicFeedOutput.parse(
    await GET(request(`feed?limit=1&cursor=${first.nextCursor ?? ""}`)).json(),
  );
  expect(second.restaurants).toHaveLength(1);
  expect(second.restaurants[0]?.slug).not.toBe("atelier-sidi-yahia");
});

test.each(["chawarma", "شاورما", "shawarma", "chawérma"])(
  "[CUS-05] finds the preview dish for %s",
  async (query) => {
    const response = GET(request("search?" + new URLSearchParams({ q: query }).toString()));
    expect(response.status).toBe(200);
    expect(publicSearchOutput.parse(await response.json()).dishes[0]).toMatchObject({
      merchantSlug: "atelier-sidi-yahia",
      names: { fr: "Chawarma maison" },
    });
  },
);

test("[CUS-05] returns empty results for a query with no matches", async () => {
  const response = GET(request("search?q=absent"));
  expect(publicSearchOutput.parse(await response.json())).toEqual({ restaurants: [], dishes: [] });
});

test("[CUS-07][CUS-08] opens a synthetic restaurant category and reads priced item options", async () => {
  const path = "merchants/atelier-sidi-yahia";
  const profile = publicRestaurantOutput.parse(await GET(request(path)).json());
  const categoryId = profile.categories[0]?.categoryId;
  const categoryPath = `${path}/categories/${categoryId ?? ""}/items`;
  const list = publicRestaurantItemsOutput.parse(
    await GET(request(`${categoryPath}?limit=1`)).json(),
  );
  expect(list.items).toHaveLength(1);
  expect(list.nextCursor).toBeTruthy();
  const next = publicRestaurantItemsOutput.parse(
    await GET(request(`${categoryPath}?limit=1&cursor=${list.nextCursor ?? ""}`)).json(),
  );
  expect(next.items).toHaveLength(1);
  expect(next.items[0]?.itemId).not.toBe(list.items[0]?.itemId);

  const itemPath = `${path}/items/${list.items[0]?.itemId ?? ""}`;
  const item = publicRestaurantItemOutput.parse(
    await GET(request(`${itemPath}?expectedRevision=${String(list.revision)}`)).json(),
  );
  expect(item.item.names.fr).toBe("Chawarma maison");
  expect(item.optionGroups[0]).toMatchObject({ minimum: 1, maximum: 1 });
  expect(item.optionGroups[0]?.options.some((option) => option.priceDeltaDzd > 0)).toBe(true);
  expect(GET(request(`${itemPath}?expectedRevision=0`)).status).toBe(409);
});

test.each(["feed?limit=0", "search", "search?q=one&q=two"])(
  "rejects malformed public inputs at %s",
  (path) => {
    expect(GET(request(path)).status).toBe(400);
  },
);

test("serves a synthetic cover at supported variant widths", async () => {
  const profile = publicRestaurantOutput.parse(
    await GET(request("merchants/atelier-sidi-yahia")).json(),
  );
  const { merchantId, coverMediaId } = profile.restaurant;
  const coverPath = `merchants/${merchantId}/profile/photos/${coverMediaId ?? ""}/variants`;
  const cover = GET(request(coverPath + "/avif/640"));
  expect(cover.status).toBe(307);
  expect(cover.headers.get("location")).toBe("/preview-catalog/chawarma-640.webp");
  expect(GET(request(coverPath + "/webp/960")).headers.get("location")).toBe(
    "/preview-catalog/chawarma-960.webp",
  );
  expect(cover.headers.get("cache-control")).toBe("no-store");
  expect(GET(request(coverPath + "/webp/1")).status).toBe(400);
});

test("serves a synthetic dish photo only for the associated menu item", async () => {
  const profile = publicRestaurantOutput.parse(
    await GET(request("merchants/atelier-sidi-yahia")).json(),
  );
  const { merchantId } = profile.restaurant;
  const list = publicRestaurantItemsOutput.parse(
    await GET(
      request(
        `merchants/atelier-sidi-yahia/categories/${profile.categories[0]?.categoryId ?? ""}/items`,
      ),
    ).json(),
  );
  const [dish, otherDish] = list.items;
  assert(dish?.photoId && otherDish);
  const dishPath = `merchants/${merchantId}/items/${dish.itemId}/photos/${dish.photoId}`;
  const photo = GET(request(dishPath + "/variants/webp/320"));
  expect(photo.status).toBe(307);
  expect(photo.headers.get("location")).toBe("/preview-catalog/chawarma-320.webp");
  expect(
    GET(request(dishPath.replace(dish.itemId, otherDish.itemId) + "/variants/webp/320")).status,
  ).toBe(404);
});
