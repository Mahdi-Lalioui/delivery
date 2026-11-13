// Captures the pickup and tracking maps on a running production build with the national tiles.
// Usage: node scripts/capture-awid-maps.mjs <baseUrl> <outDir>
import { Buffer } from "node:buffer";
import { mkdirSync } from "node:fs";
import process from "node:process";
import { chromium } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", outDir = "docs/evidence/awid/maps"] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const matrix = [
  { name: "ar-390", locale: "ar", width: 390, height: 844, scheme: "light" },
  { name: "fr-390", locale: "fr", width: 390, height: 844, scheme: "light" },
  { name: "fr-1280", locale: "fr", width: 1280, height: 900, scheme: "light" },
  { name: "fr-390-dark", locale: "fr", width: 390, height: 844, scheme: "dark" },
];

async function tileReport(page, run) {
  const tiles = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/tiles/algeria/")) return;
    const body = await response.body().catch(() => Buffer.alloc(0));
    tiles.push({ status: response.status(), bytes: body.length });
  });
  await run();
  const drawn = tiles.filter(({ status, bytes }) => status === 200 && bytes > 2000).length;
  return { requested: tiles.length, withData: drawn };
}

async function pickup(page, shot) {
  await page.goto(`${baseUrl}/${shot.locale}/discover?fulfilment=pickup`);
  const map = page.locator(".pickup-map");
  await map.locator(".pickup-pin, .pickup-cluster").first().waitFor({ timeout: 30_000 });
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await map.screenshot({ path: `${outDir}/pickup-${shot.name}.png` });
}

async function tracking(page, shot) {
  await page.goto(`${baseUrl}/${shot.locale}/dev/screens/tracking`);
  // The attribution link appears only once real streets are drawn (basemap check).
  await page.locator(".tracking-map-attribution a").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page
    .locator(".tracking-basemap")
    .screenshot({ path: `${outDir}/tracking-${shot.name}.png` });
}

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results = [];
for (const shot of matrix) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    colorScheme: shot.scheme,
    serviceWorkers: "block",
  });
  for (const [screen, run] of [
    ["pickup", pickup],
    ["tracking", tracking],
  ]) {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text().slice(0, 160));
    });
    try {
      const tiles = await tileReport(page, () => run(page, shot));
      results.push({ screen, shot: shot.name, ...tiles, errors: errors.length });
    } catch (error) {
      results.push({ screen, shot: shot.name, failed: String(error).slice(0, 200), errors });
    }
    await page.close();
  }
  await context.close();
}
await browser.close();
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
