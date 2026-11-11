import { expect, test } from "@playwright/test";
import { withAuthHarness } from "./auth-fixture.ts";

for (const preference of ["header", "navigator"] as const) {
  test(`[CUS-26:browser] ${preference} save-data requests a small cover @discovery-low-data`, async ({
    baseURL,
    page,
  }) => {
    await withAuthHarness(
      baseURL,
      async (harness) => {
        await harness.seedDiscoveryFeed();
        await page.setViewportSize({ width: 1280, height: 800 });
        if (preference === "header") {
          await page.setExtraHTTPHeaders({ "Save-Data": "on" });
        } else {
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "connection", {
              value: Object.assign(new EventTarget(), { saveData: true }),
            });
          });
        }
        await page.goto(harness.origin + "/fr/discover");
        const feed = page.getByRole("region", { name: "Tous les restaurants" });
        const cover = feed.locator('img[src*="/variants/"]').first();
        await expect(cover).toHaveAttribute("src", /\/webp\/320$/u);
        await expect(cover).toHaveAttribute("srcset", /\/webp\/320 320w$/u);
        await expect(cover).not.toHaveAttribute("srcset", /\b(?:640|960)w\b/u);
        await cover.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            cover.evaluate((image) =>
              image instanceof HTMLImageElement && image.naturalWidth > 0 ? image.currentSrc : "",
            ),
          )
          .toMatch(/\/(?:avif|webp)\/320$/u);
      },
      true,
    );
  });
}
