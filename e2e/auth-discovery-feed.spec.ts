import { expect, test } from "@playwright/test";
import { publicFeedOutput } from "../packages/contracts/src/feed.ts";
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const headings = { ar: "كل المطاعم", fr: "Tous les restaurants" } as const;

for (const locale of ["ar", "fr"] as const) {
  test(`[CUS-01:browser] ${locale} browses published restaurants and a cover without an account @discovery-feed`, async ({
    baseURL,
    page,
  }, testInfo) => {
    await withAuthHarness(
      baseURL,
      async (harness) => {
        const fixture = await harness.seedDiscoveryFeed();
        const firstPage = await page.request.get(harness.origin + "/v1/feed?limit=1");
        expect(firstPage.status()).toBe(200);
        const first = publicFeedOutput.parse(await firstPage.json());
        expect(first.restaurants).toHaveLength(1);
        if (!first.nextCursor) throw new Error("Expected more seeded feed rows.");
        const nextPage = await page.request.get(
          harness.origin + "/v1/feed?cursor=" + first.nextCursor,
        );
        expect(nextPage.status()).toBe(200);
        const next = publicFeedOutput.parse(await nextPage.json());
        expect(next.restaurants).toHaveLength(2);
        expect(next.nextCursor).toBeNull();
        const published = [...first.restaurants, ...next.restaurants];
        expect(new Set(published.map(({ merchantId }) => merchantId)).size).toBe(3);
        expect(published.map(({ name }) => name)).toContain(fixture.publishedName);
        await page.goto(harness.origin + "/" + locale + "/discover");
        await page
          .getByRole("link")
          .and(page.locator(`a[href="/${locale}/discover"]`))
          .click();
        await expect(page).toHaveURL(harness.origin + "/" + locale + "/discover");
        const feed = page.getByRole("region", { name: headings[locale] });
        await expect(feed.getByText(fixture.publishedName, { exact: true })).toBeVisible();
        await expect(feed.getByText(fixture.hiddenName, { exact: true })).toHaveCount(0);
        const photo = feed.locator("img").first();
        await expect
          .poll(() =>
            photo.evaluate((element) =>
              element instanceof HTMLImageElement ? element.naturalWidth : 0,
            ),
          )
          .toBeGreaterThan(0);
        for (const theme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
          for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
            await attachPageScreenshot(page, testInfo, `feed-${locale}-${theme}-${String(width)}`);
          }
        }
      },
      true,
    );
  });
}
