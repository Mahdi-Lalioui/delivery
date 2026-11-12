import { expect, test } from "@playwright/test";
import { discoveryLocationOutput } from "../packages/contracts/src/discovery.ts";
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const labels = {
  fr: {
    open: "Choisir une adresse",
    search: "Rechercher une commune",
    save: "Confirmer le lieu de livraison",
    saved: "Lieu de livraison enregistré",
    filters: "Filtres",
    fee: "Frais les plus bas",
    apply: "Voir les restaurants",
  },
  ar: {
    open: "اختيار عنوان",
    search: "البحث عن بلدية",
    save: "تأكيد موقع التوصيل",
    saved: "تم حفظ موقع التوصيل",
    filters: "التصفية",
    fee: "أقل رسوم توصيل",
    apply: "اعرض المطاعم",
  },
} as const;

for (const locale of ["ar", "fr"] as const) {
  test(`[CUS-02:browser] ${locale} saves a covered commune without signing in @discovery-location`, async ({
    baseURL,
    page,
  }, testInfo) => {
    await withAuthHarness(baseURL, async (harness) => {
      const commune = await harness.seedAlgiersCommune();
      const name = locale === "ar" ? commune.nameAr : commune.nameFr;
      const copy = labels[locale];
      await page.goto(harness.origin + "/" + locale + "/discover");
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await page.getByRole("button", { name: copy.open }).click();
      const dialog = page.getByRole("dialog");
      const search = dialog.getByRole("searchbox", { name: copy.search });
      const communeChoice = dialog.getByRole("radio", { name, exact: true });
      await search.fill(name);
      await communeChoice.check();
      await search.fill("0000");
      await expect(dialog.getByRole("button", { name: copy.save })).toBeDisabled();
      await search.fill(name);
      await communeChoice.check();

      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
          await attachPageScreenshot(
            page,
            testInfo,
            `discovery-${locale}-${theme}-${String(width)}`,
          );
        }
      }

      const lookup = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/v1/geo/serviceability",
      );
      const feed = page.waitForRequest(
        (request) => {
          const url = new URL(request.url());
          return (
            url.pathname === "/v1/feed" &&
            url.searchParams.get("communeId") === commune.id &&
            url.searchParams.size === 1
          );
        },
        { timeout: 5_000 },
      );
      await page.getByRole("button", { name: copy.save }).click();
      const response = await lookup;
      expect(response.status()).toBe(200);
      const location = discoveryLocationOutput.parse(await response.json());
      expect(location.communeId).toBe(commune.id);
      expect(location.serviceAreaId).not.toBeNull();
      await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
      const requestUrl = new URL((await feed).url());
      expect([...requestUrl.searchParams.keys()]).toEqual(["communeId"]);
      const reloadFeed = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          url.pathname === "/v1/feed" &&
          url.searchParams.get("communeId") === commune.id &&
          url.searchParams.size === 1
        );
      });
      await page.reload();
      await reloadFeed;
      await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: copy.filters, exact: true }).click();
      await dialog.getByRole("radio", { name: copy.fee, exact: true }).check();
      const sorted = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          url.pathname === "/v1/feed" &&
          url.searchParams.get("sort") === "fee" &&
          url.searchParams.get("communeId") === commune.id &&
          url.searchParams.size === 2
        );
      });
      await dialog.getByRole("button", { name: copy.apply }).click();
      await sorted;
      await expect(page).toHaveURL(/[?&]sort=fee$/u);
    });
  });
}

test("[CUS-02:browser] keeps browsing available after saving an outside-area GPS point @discovery-location", async ({
  baseURL,
  context,
  page,
}) => {
  await withAuthHarness(baseURL, async (harness) => {
    await harness.seedAlgiersCommune();
    await context.grantPermissions(["geolocation"], { origin: harness.origin });
    await context.setGeolocation({ latitude: 35.69, longitude: -0.64, accuracy: 90 });
    await page.goto(harness.origin + "/fr/discover");
    await page.getByRole("button", { name: labels.fr.open }).click();
    const gps = page.getByRole("button", { name: "Utiliser ma position" });
    const save = page.getByRole("button", { name: labels.fr.save });
    await gps.click();
    await expect(page.getByText(/Votre position est approximative/u)).toBeVisible();
    await expect(save).toBeDisabled();
    await context.setGeolocation({ latitude: 35.69, longitude: -0.64, accuracy: 15 });
    await gps.click();
    await save.click();
    const outside = page.getByText("Nous ne livrons pas encore à cet endroit.", { exact: true });
    await expect(outside).toBeVisible();
    await page.reload();
    await expect(outside).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test("[CUS-02] selects a commune from wilaya 69 and preserves it across reloads", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (harness) => {
    await harness.seedAlgiersCommune();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(harness.origin + "/fr/discover");
    await page.getByRole("button", { name: labels.fr.open }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Wilaya" }).selectOption("69");
    await dialog.getByRole("radio", { name: "El Abiodh Sidi Cheikh", exact: true }).check();
    await dialog.getByRole("button", { name: labels.fr.save }).click();
    await expect(page.getByText(labels.fr.saved, { exact: true })).toBeVisible();
    await expect(page.getByText("El Abiodh Sidi Cheikh", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("El Abiodh Sidi Cheikh", { exact: true })).toBeVisible();
  });
});
