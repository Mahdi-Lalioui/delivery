import { expect, test, type APIRequestContext } from "@playwright/test";
import { publicRestaurantOutput } from "../packages/contracts/src/restaurant.ts";
import { withAuthHarness } from "./auth-fixture.ts";

async function expectRevalidation(request: APIRequestContext, url: string) {
  const first = await request.get(url);
  expect(first.status()).toBe(200);
  expect(first.headers()["cache-control"]).toBe("private, no-cache");
  const tag = first.headers().etag ?? "";
  expect(tag).toMatch(/^W\/"[a-f0-9]{64}"$/u);
  const unchanged = await request.get(url, { headers: { "if-none-match": tag } });
  expect(unchanged.status()).toBe(304);
  expect(unchanged.headers().etag).toBe(tag);
  expect(await unchanged.text()).toBe("");
  return first;
}

test("[CUS-01:cache] [CUS-07:cache] revalidates anonymous feed and menu data @discovery-cache", async ({
  baseURL,
  request,
}) => {
  await withAuthHarness(
    baseURL,
    async (harness) => {
      await harness.seedDiscoverySearch();
      await expectRevalidation(request, harness.origin + "/v1/feed");
      const restaurant = harness.origin + "/v1/merchants/chawarma-fixture";
      const profile = publicRestaurantOutput.parse(
        await (await expectRevalidation(request, restaurant)).json(),
      );
      const category = profile.categories[0];
      if (!category) throw new Error("Missing synthetic menu category");
      await expectRevalidation(
        request,
        restaurant + "/categories/" + category.categoryId + "/items",
      );
    },
    true,
  );
});
