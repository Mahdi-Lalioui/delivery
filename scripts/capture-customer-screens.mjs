// Captures every customer screen (first viewport and full page) on a running preview build.
// Usage: pnpm evidence:screens <baseUrl> <outDir> [variant ...]
import { mkdirSync } from "node:fs";
import process from "node:process";
import { chromium } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", outDir = "docs/evidence/awid/jury", ...only] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const screens = {
  landing: "/",
  discover: "/discover",
  pickup: "/discover?fulfilment=pickup",
  restaurant: "/restaurants/atelier-sidi-yahia",
  "sign-in": "/sign-in",
  account: "/account",
  checkout: "/dev/screens/checkout",
  payment: "/dev/screens/checkout-payment",
  confirmed: "/dev/screens/confirmed",
  tracking: "/dev/screens/tracking",
  waiting: "/dev/screens/tracking-waiting",
  "pickup-tracking": "/dev/screens/tracking-pickup",
  rating: "/dev/screens/rating",
  orders: "/dev/screens/orders",
};
const variants = [
  { name: "ar-390", locale: "ar", width: 390, scheme: "light" },
  { name: "fr-390", locale: "fr", width: 390, scheme: "light" },
  { name: "fr-1280", locale: "fr", width: 1280, scheme: "light" },
  { name: "fr-390-dark", locale: "fr", width: 390, scheme: "dark" },
].filter(({ name }) => only.length === 0 || only.includes(name));

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
  for (const [name, path] of Object.entries(screens)) {
    const prefix = variant.locale === "ar" ? "/ar" : `/${variant.locale}`;
    await page.goto(`${baseUrl}${prefix}${path === "/" ? "" : path}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1200);
    const file = `${outDir}/${name}-${variant.name}`;
    await page.screenshot({ path: `${file}.png` });
    await page.screenshot({ path: `${file}-full.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
process.stdout.write(`captured ${String(variants.length * Object.keys(screens).length)}\n`);
