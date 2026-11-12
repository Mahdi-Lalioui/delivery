import { expect, test } from "@playwright/test";
import { attachPageScreenshot } from "./visual.ts";

const headings = {
  ar: "أنت غير متصل بالإنترنت",
  fr: "Vous êtes hors ligne",
  en: "You’re offline",
} as const;

for (const locale of ["ar", "fr", "en"] as const) {
  test(`[CUS-25:offline] ${locale} discovery shows a localized offline page @customer-offline`, async ({
    context,
    page,
  }, testInfo) => {
    const discover = "/" + locale + "/discover";
    await page.goto(discover);
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? null))
      .toBe("activated");

    const storedPaths = await page.evaluate(async () => {
      const keys = await caches.keys();
      const cache = keys.find((key) => key.startsWith("zaafran-offline-"));
      if (!cache) return [];
      const requests = await (await caches.open(cache)).keys();
      return requests.map((request) => new URL(request.url).pathname).sort();
    });
    expect(storedPaths).toEqual([
      "/brand/awid-icon.svg",
      "/pwa/ar/offline",
      "/pwa/en/offline",
      "/pwa/fr/offline",
      "/pwa/offline.css",
    ]);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: headings[locale], exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

    if (locale !== "en") {
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        for (const [width, height] of [
          [390, 844],
          [768, 1024],
          [1280, 800],
        ] as const) {
          await page.setViewportSize({ width, height });
          await attachPageScreenshot(page, testInfo, `offline-${locale}-${theme}-${String(width)}`);
        }
      }
    }

    await expect(page.goto("/" + locale + "/account/sessions")).rejects.toThrow();
    await context.setOffline(false);
    await page.goto(discover);
    await expect(page.getByRole("heading", { name: headings[locale], exact: true })).toHaveCount(0);
  });
}
