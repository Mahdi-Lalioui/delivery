import { expect, test } from "@playwright/test";
import { publicSearchOutput } from "../packages/contracts/src/search.ts";
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const copy = {
  ar: {
    search: "ابحث عن طبق أو مطعم",
    clear: "مسح السجل",
    query: "شاورما",
    dish: "شاورما الدجاج",
    close: "إغلاق البحث",
  },
  fr: {
    search: "Rechercher un plat ou un restaurant",
    clear: "Effacer l’historique",
    query: "chawarma",
    dish: "Chawarma poulet",
    close: "Fermer la recherche",
  },
} as const;

for (const locale of ["ar", "fr"] as const) {
  test(`[CUS-05:browser] ${locale} searches published dishes and clears local history @discovery-search`, async ({
    baseURL,
    page,
  }, testInfo) => {
    await withAuthHarness(
      baseURL,
      async (harness) => {
        await harness.seedDiscoverySearch();
        const labels = copy[locale];
        await expect
          .poll(async () => {
            const response = await page.request.get(
              harness.origin + "/v1/search?q=" + encodeURIComponent(labels.query),
            );
            return response.ok() && publicSearchOutput.parse(await response.json()).dishes.length;
          })
          .toBe(1);
        await page.goto(harness.origin + "/" + locale);
        await page.getByRole("button", { name: labels.search }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("searchbox", { name: labels.search }).fill(labels.query);
        await expect(dialog.getByText(labels.dish, { exact: true })).toBeVisible();
        for (const theme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
          for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
            await attachPageScreenshot(
              page,
              testInfo,
              `search-${locale}-${theme}-${String(width)}`,
            );
          }
        }
        await dialog.getByRole("button", { name: labels.close }).click();
        await page.reload();
        await page.getByRole("button", { name: labels.search }).click();
        const history = dialog.locator(".discovery-search-group").filter({
          has: page.getByRole("button", { name: labels.clear }),
        });
        await expect(
          history.getByRole("button", { name: labels.query, exact: true }),
        ).toBeVisible();
        await dialog.getByRole("button", { name: labels.clear }).click();
        await expect(dialog.getByRole("button", { name: labels.clear })).toHaveCount(0);
      },
      true,
    );
  });
}
