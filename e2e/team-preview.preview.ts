import { expect, test } from "@playwright/test";
import { previewMessages } from "../apps/web/src/preview/preview-messages.ts";
import { attachPageScreenshot } from "./visual.ts";

for (const locale of ["ar", "fr"] as const) {
  test(`team preview exposes the ${locale} showcase and visual evidence`, async ({
    page,
  }, info) => {
    const messages = previewMessages[locale];
    await page.goto(`/${locale}`);
    await page.getByRole("link", { name: messages.badge, exact: true }).click();
    await expect(page.getByRole("heading", { name: messages.title })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
    const poster = page.locator('img[src="/photos/algeria/algiers-casbah.webp"]');
    await expect
      .poll(() =>
        poster.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth > 0),
      )
      .toBe(true);
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const [width, height] of [
        [390, 844],
        [1280, 800],
      ] as const) {
        await page.setViewportSize({ width, height });
        await attachPageScreenshot(page, info, `preview-${locale}-${theme}-${String(width)}`);
      }
    }
    const operations = page.getByRole("link", { name: messages.admin.title, exact: true });
    await operations.click();
    await expect(page).toHaveURL(/screen=admin-billing/u);
    await expect(page.getByRole("main")).toBeVisible();
  });
}

test("team preview searches, configures and saves a synthetic dish without an API server", async ({
  page,
  request,
}) => {
  await page.goto("/fr/discover");
  await expect(page.getByRole("link", { name: "L’Atelier Sidi Yahia", exact: true })).toBeVisible();
  const cover = page.locator('img[src*="/profile/photos/"]').first();
  await cover.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      cover.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth > 0),
    )
    .toBe(true);
  const search = "Rechercher un plat ou un restaurant";
  await page.getByRole("button", { name: search }).click();
  const results = page.getByRole("dialog");
  await results.getByRole("searchbox", { name: search }).fill("shawarma");
  await results.getByRole("link", { name: "Chawarma maison", exact: true }).click();
  await expect(page.getByRole("heading", { name: "L’Atelier Sidi Yahia" })).toBeVisible();
  await page.getByRole("button", { name: "Choisir · Chawarma maison" }).click();
  const item = page.getByRole("dialog");
  const add = item.getByRole("button", { name: /^Ajouter/u });
  await expect(add).toBeDisabled();
  await item.getByRole("radio", { name: /^Grande/u }).check();
  await expect(add).toContainText("800");
  await add.click();
  await page.reload();
  await page.getByRole("button", { name: "Voir le panier", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Chawarma maison", { exact: true }),
  ).toBeVisible();
  expect((await request.post("/v1/me/deletion-challenge")).status()).toBe(405);
});
