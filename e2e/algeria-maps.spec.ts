import { getMessages } from "../packages/i18n/src/messages.ts";
import { expect, test } from "@playwright/test";
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const labels = {
  ar: { address: "اختيار عنوان", save: "تأكيد موقع التوصيل", gps: "استخدام موقعي" },
  fr: {
    address: "Choisir une adresse",
    save: "Confirmer le lieu de livraison",
    gps: "Utiliser ma position",
  },
};

const configurations = [
  { locale: "ar", width: 390, theme: "light" },
  { locale: "ar", width: 390, theme: "dark" },
  { locale: "fr", width: 390, theme: "light" },
  { locale: "fr", width: 1280, theme: "dark" },
] as const;

for (const { locale, width, theme } of configurations) {
  const { address, save, gps } = labels[locale];
  test(`[GEO-02:GEO-05:GEO-10] ${locale} ${theme} ${String(width)} confirms a map pin`, async ({
    baseURL,
    page,
    context,
  }, testInfo) => {
    await withAuthHarness(baseURL, async (harness) => {
      const { origin } = harness;
      await harness.seedAlgiersCommune();
      await context.grantPermissions(["geolocation"], { origin });
      await context.setGeolocation({ latitude: 36.7538, longitude: 3.0588, accuracy: 90 });
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const failed: string[] = [];
      page.on("pageerror", (error) => {
        failed.push(error.message);
      });
      page.on("console", (message) => {
        if (message.type() === "error") failed.push(message.text());
      });
      await page.goto(origin + "/" + locale + "/discover");
      await page.getByRole("button", { name: address }).click();
      const map = getMessages(locale).maps;
      await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
      await page.getByRole("button", { name: gps }).click();
      const tile = page.waitForResponse(
        (response) => response.url().includes("/tiles/algeria/") && response.ok(),
      );
      const glyph = page.waitForResponse(
        (response) => response.url().includes("/map-assets/fonts/") && response.ok(),
      );
      await page.getByRole("button", { name: map.show }).click();
      await tile;
      await glyph;
      const pin = page.getByRole("button", { name: map.choose });
      await expect(pin).toBeEnabled();
      await expect(page.getByRole("button", { name: save })).toBeDisabled();
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
      const surface = await page.locator(".awid-map-canvas").boundingBox();
      expect(surface?.height ?? 0).toBeGreaterThan(200);
      await page.screenshot({ path: testInfo.outputPath("map.png"), animations: "disabled" });
      await attachPageScreenshot(
        page,
        testInfo,
        `location-map-${locale}-${theme}-${String(width)}`,
      );
      await page.getByRole("button", { name: map.zoomOut }).click();
      await pin.click();
      await page.getByRole("button", { name: save }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      expect(failed).toEqual([]);
    });
  });
}
