import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { publicSearchOutput } from "../packages/contracts/src/search.ts";
import { formatDzd } from "../packages/i18n/src/formats.ts";
import { withAuthHarness } from "./auth-fixture.ts";

const labels = {
  fr: {
    search: "Rechercher un plat ou un restaurant",
    query: "chawarma",
    location: "Choisir une adresse",
    commune: "Rechercher une commune",
    saveLocation: "Confirmer le lieu de livraison",
    dish: "Chawarma poulet",
    choose: "Choisir",
    sauce: "Sauce blanche",
    increaseQuantity: "Augmenter la quantité",
    note: "Note pour la cuisine",
    add: /^Ajouter/u,
    cart: "Voir le panier",
    heading: "Panier",
  },
  ar: {
    search: "ابحث عن طبق أو مطعم",
    query: "شاورما",
    location: "اختيار عنوان",
    commune: "البحث عن بلدية",
    saveLocation: "تأكيد موقع التوصيل",
    dish: "شاورما الدجاج",
    choose: "اختيار",
    sauce: "صلصة بيضاء",
    increaseQuantity: "زيادة الكمية",
    note: "ملاحظة للمطبخ",
    add: /^أضف/u,
    cart: "عرض السلة",
    heading: "السلة",
  },
} as const;
async function captureMatrix(page: Page, info: TestInfo, prefix: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [390, 768, 1280]) {
      const height = width === 390 ? 844 : width === 768 ? 1024 : 800;
      await page.setViewportSize({ width, height });
      const itemScroll = page.locator(".restaurant-item-scroll");
      if (prefix.startsWith("item-") || prefix.startsWith("form-")) {
        await itemScroll.evaluate((pane, bottom) => {
          pane.scrollTop = bottom ? pane.scrollHeight : 0;
        }, prefix.startsWith("form-"));
        await expect(page.locator(".restaurant-item-submit button")).toBeInViewport({ ratio: 1 });
      }
      const body = await page.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
      await info.attach(`${prefix}-${theme}-${String(width)}.png`, {
        body,
        contentType: "image/png",
      });
    }
  }
}

for (const locale of ["ar", "fr"] as const) {
  test(`[CUS-08:browser] [CUS-09:browser] ${locale} configures an item and keeps the cart after reload @restaurant-cart @discovery`, async ({
    baseURL,
    page,
  }, info) => {
    await withAuthHarness(
      baseURL,
      async (harness) => {
        const commune = await harness.seedDiscoverySearch();
        const copy = labels[locale];
        await expect
          .poll(async () => {
            const response = await page.request.get(
              harness.origin + "/v1/search?q=" + encodeURIComponent(copy.query),
            );
            return response.ok() && publicSearchOutput.parse(await response.json()).dishes.length;
          })
          .toBe(1);
        await page.goto(harness.origin + "/" + locale + "/discover");
        const communeName = locale === "ar" ? commune.nameAr : commune.nameFr;
        await page.getByRole("button", { name: copy.location }).click();
        const location = page.getByRole("dialog");
        await location.getByRole("searchbox", { name: copy.commune }).fill(communeName);
        await location.getByRole("radio", { name: communeName, exact: true }).check();
        await location.getByRole("button", { name: copy.saveLocation }).click();
        await expect(location).toHaveCount(0);
        await page.getByRole("button", { name: copy.search }).click();
        const search = page.getByRole("dialog");
        await search.getByRole("searchbox", { name: copy.search }).fill(copy.query);
        await search.getByRole("link", { name: copy.dish, exact: true }).click();
        const choose = page.getByRole("button", {
          name: copy.choose + " · " + copy.dish,
          exact: true,
        });
        await expect(choose).toBeVisible();
        await captureMatrix(page, info, "menu-" + locale);
        await choose.click();
        const item = page.getByRole("dialog");
        const add = item.getByRole("button", { name: copy.add });
        await expect(add).toBeDisabled();
        await item.getByRole("radio", { name: new RegExp(copy.sauce, "u") }).check();
        await item.getByRole("button", { name: copy.increaseQuantity }).click();
        await expect(add).toBeEnabled();
        await expect(add).toContainText(formatDzd(1100, locale));
        await captureMatrix(page, info, "item-" + locale);
        await expect(item.getByRole("textbox", { name: copy.note })).toBeVisible();
        await captureMatrix(page, info, "form-" + locale);
        await add.click();
        await page.reload();
        await page.getByRole("button", { name: copy.cart, exact: true }).click();
        const cart = page.getByRole("dialog");
        await expect(cart.getByRole("heading", { name: copy.heading, exact: true })).toBeVisible();
        await expect(cart.getByText(copy.dish, { exact: true })).toBeVisible();
        await expect(cart.getByText(copy.sauce, { exact: true })).toBeVisible();
        await expect(cart.getByText(formatDzd(1100, locale), { exact: true })).toBeVisible();
        await captureMatrix(page, info, "cart-" + locale);
      },
      true,
    );
  });
}
