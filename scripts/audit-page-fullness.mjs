// Full-page audit (DESIGN §0): no page may leave an empty rectangle over 30 % of the
// viewport, at the top or at the bottom of the page, at any of eight widths, in Arabic and French,
// light and dark. Usage: pnpm audit:fullness <baseUrl> [outFile]
import { writeFileSync } from "node:fs";
import process from "node:process";
import { chromium } from "@playwright/test";
import { fullnessProbe } from "../e2e/fullness-probe.ts";

const [baseUrl = "http://127.0.0.1:3110", outFile, ...only] = process.argv.slice(2);
const limit = 0.3;
const allWidths = [360, 390, 430, 768, 1024, 1280, 1440, 1920];
// Optional filters after the out file: widths (e.g. 390 1920) and "light" or "dark".
const widths = only.some((item) => /^\d+$/.test(item))
  ? allWidths.filter((width) => only.includes(String(width)))
  : allWidths;
const schemes = only.filter((item) => item === "light" || item === "dark");
const routes = [
  "",
  "/discover",
  "/discover?fulfilment=pickup",
  "/restaurants/atelier-sidi-yahia",
  "/sign-in",
  "/account",
  "/dev/screens/checkout",
  "/dev/screens/checkout-payment",
  "/dev/screens/confirmed",
  "/dev/screens/tracking",
  "/dev/screens/tracking-pickup",
  "/dev/screens/rating",
  "/dev/screens/orders",
  "/dev/screens/orders-empty",
  "/dev/screens/checkout-empty",
];

async function measure(page, url) {
  await page.goto(url, { timeout: 20_000 });
  // Maps keep the network busy; give a page three seconds to settle, not the default 30.
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  const top = await page.evaluate(fullnessProbe);
  await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  await page.waitForTimeout(500);
  const bottom = await page.evaluate(fullnessProbe);
  return { top, bottom };
}

const browser = await chromium.launch();
const failures = [];
const results = [];
function viewportFor(width) {
  // Phones are tall (about 19.5:9), a 768 tablet is 768 × 1024, desktops 900 high.
  if (width >= 1024) return { width, height: 900 };
  if (width >= 768) return { width, height: 1024 };
  return { width, height: Math.round(width * 2.1) };
}

async function checkPage(page, path, label) {
  const { top, bottom } = await measure(page, baseUrl + path).catch(() => ({
    top: -1,
    bottom: -1,
  }));
  const row = { url: path, ...label, top, bottom };
  results.push(row);
  if (top <= limit && bottom <= limit) return;
  failures.push(row);
  process.stdout.write(
    `GAP ${path} ${String(label.width)} ${label.scheme}: top ${top.toFixed(2)} bottom ${bottom.toFixed(2)}\n`,
  );
}

const paths = ["fr", "ar"].flatMap((locale) => routes.map((route) => `/${locale}${route}`));
const views = (schemes.length > 0 ? schemes : ["light", "dark"]).flatMap((scheme) =>
  widths.map((width) => ({ scheme, width })),
);
for (const { scheme, width } of views) {
  const context = await browser.newContext({
    viewport: viewportFor(width),
    colorScheme: scheme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  for (const path of paths) await checkPage(page, path, { width, scheme });
  await context.close();
}
await browser.close();
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
process.stdout.write(
  JSON.stringify({ checked: results.length, failures: failures.length, limit }) + "\n",
);
process.exitCode = failures.length > 0 ? 1 : 0;
