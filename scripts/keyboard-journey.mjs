// Desktop keyboard-only journey on a running preview build: restaurant → add a dish → checkout.
// Usage: pnpm audit:keyboard-journey <baseUrl> <locale>
import process from "node:process";
import { chromium } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", locale = "fr"] = process.argv.slice(2);
const prefix = locale === "ar" ? "/ar" : `/${locale}`;

/** Presses Tab until the focused element matches `selector`; fails after `limit` presses. */
async function tabTo(page, selector, limit = 120) {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    const isThere = await page.evaluate(
      `document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`,
    );
    if (isThere) return step + 1;
  }
  throw new Error(`Tab never reached ${selector}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const steps = [];
await page.goto(`${baseUrl}${prefix}/restaurants/atelier-sidi-yahia`);
await page.waitForLoadState("networkidle").catch(() => undefined);
steps.push(["first dish Add", await tabTo(page, ".restaurant-dish-add:not(:disabled)")]);
await page.keyboard.press("Enter");
// Pressing Add before a required choice moves focus to that choice; Space picks it.
steps.push(["dish sheet Add", await tabTo(page, "form button[type=submit]", 40)]);
await page.keyboard.press("Enter");
const focusedRequired = await page.evaluate(
  `document.activeElement?.matches("fieldset[data-group] input") ?? false`,
);
if (focusedRequired) {
  await page.keyboard.press("Space");
  steps.push(["required choice", "focused and picked"]);
  steps.push(["dish sheet Add again", await tabTo(page, "form button[type=submit]", 40)]);
  await page.keyboard.press("Enter");
}
await page.waitForTimeout(600);
steps.push(["checkout", await tabTo(page, "a.restaurant-checkout")]);
await page.keyboard.press("Enter");
await page.waitForURL(/\/checkout/u, { timeout: 15_000 });
steps.push(["arrived", page.url().replace(baseUrl, "")]);
await browser.close();
process.stdout.write(`${JSON.stringify(steps)}\n`);
