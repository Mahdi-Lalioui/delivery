// Captures the screens that open on a tap: search, the dish sheet and the cart.
// Usage: node scripts/capture-interactions.mjs <baseUrl> <outDir>
import { mkdirSync } from "node:fs";
import process from "node:process";
import { chromium } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", outDir = "docs/evidence/awid/jury"] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const variants = [
  { name: "ar-390", locale: "ar", width: 390, scheme: "light" },
  { name: "fr-390", locale: "fr", width: 390, scheme: "light" },
  { name: "fr-1280", locale: "fr", width: 1280, scheme: "light" },
  { name: "fr-390-dark", locale: "fr", width: 390, scheme: "dark" },
];
const restaurant = "/restaurants/atelier-sidi-yahia";

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(900);
}

async function captureSearch(page, locale, file) {
  await page.goto(`${baseUrl}/${locale}/discover`);
  await settle(page);
  await page.locator(".discovery-search-trigger").first().click();
  await settle(page);
  await page.screenshot({ path: `${file("search")}.png` });
}

async function captureDish(page, locale, file) {
  await page.goto(`${baseUrl}/${locale}${restaurant}`);
  await settle(page);
  await page.locator(".restaurant-dish").first().click();
  await settle(page);
  await page.screenshot({ path: `${file("dish")}.png` });
  await page.keyboard.press("Escape");
}

async function captureCart(page, locale, file) {
  await page.goto(`${baseUrl}/${locale}${restaurant}`);
  await settle(page);
  await page.locator(".restaurant-dish").first().click();
  await settle(page);
  // The first dish needs a size: take the first option, then add it.
  await page.locator(".restaurant-choice").first().click();
  await page.locator(".restaurant-item-submit button").first().click();
  await settle(page);
  const bar = page.locator(".restaurant-cart-bar button").first();
  if (await bar.isVisible()) await bar.click();
  await settle(page);
  await page.screenshot({ path: `${file("cart")}.png` });
}

const browser = await chromium.launch();
for (const variant of variants) {
  const context = await browser.newContext({
    viewport: { width: variant.width, height: variant.width > 600 ? 900 : 844 },
    deviceScaleFactor: 1,
    colorScheme: variant.scheme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const file = (name) => `${outDir}/${name}-${variant.name}`;
  for (const capture of [captureSearch, captureDish, captureCart]) {
    await capture(page, variant.locale, file).catch((error) => {
      process.stdout.write(
        `skip ${capture.name} ${variant.name}: ${String(error).slice(0, 120)}\n`,
      );
    });
  }
  await context.close();
}
await browser.close();
process.stdout.write("done\n");
