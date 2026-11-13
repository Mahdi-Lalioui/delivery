// Captures every customer screen (first viewport and full page) on a running preview build.
// Usage: pnpm evidence:screens <baseUrl> <outDir> [variant ...]
import { mkdirSync } from "node:fs";
import process from "node:process";
import { chromium } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", outDir = "docs/evidence/awid/jury", ...only] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const stateScreens = {};
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
// States (design build fixtures), captured only when named on the command line.
for (const state of [
  "checkout-loading",
  "checkout-error",
  "checkout-empty",
  "checkout-expired-cart",
  "checkout-promo",
  "checkout-offer",
  "checkout-promo-rejected",
  "tracking-loading",
  "tracking-error",
  "tracking-not-found",
  "tracking-delivered",
  "tracking-rejected",
  "tracking-expired",
  "tracking-cancelled",
  "tracking-delivery-failed",
  "orders-loading",
  "orders-empty",
  "orders-error",
  "rating-loading",
  "rating-error",
]) {
  stateScreens[state] = `/dev/screens/${state}`;
}
const allVariants = [
  { name: "ar-390", locale: "ar", width: 390, scheme: "light" },
  { name: "fr-390", locale: "fr", width: 390, scheme: "light" },
  { name: "fr-1280", locale: "fr", width: 1280, scheme: "light" },
  { name: "fr-390-dark", locale: "fr", width: 390, scheme: "dark" },
];
const variantNames = new Set(allVariants.map(({ name }) => name));
const askedVariants = only.filter((item) => variantNames.has(item));
const askedScreens = only.filter((item) => !variantNames.has(item));
const variants = allVariants.filter(
  ({ name }) => askedVariants.length === 0 || askedVariants.includes(name),
);
const chosen = Object.entries({ ...screens, ...stateScreens }).filter(([name]) =>
  askedScreens.length === 0 ? name in screens : askedScreens.includes(name),
);

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
  for (const [name, path] of chosen) {
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
process.stdout.write(`captured ${String(variants.length * chosen.length)}\n`);
