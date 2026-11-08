import { expect, test } from "@playwright/test";
import { publicRestaurantItemsOutput } from "../packages/contracts/src/restaurant.ts";
import { withAuthHarness } from "./auth-fixture.ts";

test("[CUS-07:browser] [CUS-08:browser] refreshes the public menu after stale item and category requests @restaurant-revision", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(
    baseURL,
    async (harness) => {
      await harness.seedDiscoverySearch();
      const merchantPath = "/v1/merchants/chawarma-fixture";
      const categoryPattern = new RegExp(`${merchantPath}/categories/[^/]+/items\\?`, "u");
      const detailPattern = new RegExp(`${merchantPath}/items/[^/]+\\?`, "u");
      let profiles = 0;
      let firstPages = 0;
      let staleCursor: string | null = null;
      let sentDetail = false;
      let displayedRevision: number | null = null;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === merchantPath) profiles += 1;
        if (detailPattern.test(request.url())) sentDetail = true;
      });
      await page.route(categoryPattern, async (route) => {
        const cursor = new URL(route.request().url()).searchParams.get("cursor");
        if (cursor !== null) {
          staleCursor = cursor;
          await route.fulfill({ status: 409 });
          return;
        }
        firstPages += 1;
        const response = await route.fetch();
        const payload = publicRestaurantItemsOutput.parse(await response.json());
        const first = payload.items[0];
        if (!first) throw new Error("Expected one public dish");
        if (!sentDetail) {
          // Model the menu changing between the profile and the first category page.
          displayedRevision = payload.revision + 1;
          await route.fulfill({ response, json: { ...payload, revision: displayedRevision } });
        } else if (staleCursor === null) {
          await route.fulfill({
            response,
            json: { ...payload, nextCursor: `${String(payload.revision)}~${first.itemId}` },
          });
        } else {
          await route.fulfill({ response });
        }
      });

      await page.goto(harness.origin + "/fr/restaurants/chawarma-fixture");
      const choose = page.getByRole("button", { name: "Choisir · Chawarma poulet", exact: true });
      await expect(choose).toBeVisible();
      const staleDetail = page.waitForResponse((response) => detailPattern.test(response.url()));
      await choose.click();
      const response = await staleDetail;
      expect(new URL(response.url()).searchParams.get("expectedRevision")).toBe(
        String(displayedRevision),
      );
      expect(response.status()).toBe(409);

      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByText("La carte a changé. Choisissez de nouveau votre plat."),
      ).toBeVisible();
      await expect(choose).toBeVisible();
      expect(profiles).toBe(2);
      expect(firstPages).toBe(2);

      await page.getByRole("button", { name: "Plus de plats" }).click();
      await expect.poll(() => profiles).toBe(3);
      await expect(choose).toBeVisible();
      expect(firstPages).toBe(3);
      expect(staleCursor).toMatch(/^[0-9]+~/u);
      await expect(page.getByRole("button", { name: "Plus de plats" })).toHaveCount(0);

      await choose.click();
      await expect(
        page.getByRole("dialog").getByRole("radio", { name: /Sauce blanche/u }),
      ).toBeVisible();
    },
    true,
  );
});
