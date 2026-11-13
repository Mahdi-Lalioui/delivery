// Captures customer states that need a real route and a staged network: loading, error, empty,
// offline, slow network, closed restaurant and sold-out dish. Runs on a preview build.
// Usage: pnpm evidence:live-states <baseUrl> <outDir> [variant ...]
import { mkdirSync } from "node:fs";
import process from "node:process";
import { chromium } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", outDir = "docs/evidence/awid/states", ...only] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const never = () => new Promise(() => undefined);
const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** Each state: where to go, how to stage the network, and what to wait for. */
const states = {
  "discover-loading": {
    scrollTo: ".restaurant-feed-header",
    path: "/discover",
    stage: (page) => page.route("**/v1/feed**", never),
    settle: 1500,
  },
  "discover-error": {
    scrollTo: ".restaurant-feed-header",
    path: "/discover",
    stage: (page) => page.route("**/v1/feed**", (route) => route.fulfill({ status: 500 })),
  },
  "discover-empty": {
    scrollTo: ".restaurant-feed-header",
    path: "/discover",
    stage: (page) =>
      page.route("**/v1/feed**", (route) =>
        route.fulfill(json({ restaurants: [], nextCursor: null, totalCount: 0 })),
      ),
  },
  "discover-filtered-empty": {
    scrollTo: ".restaurant-feed-header",
    path: "/discover?minRating=4&maxEtaMinutes=30&priceLevel=3",
  },
  "restaurant-loading": {
    path: "/restaurants/atelier-sidi-yahia",
    stage: (page) => page.route("**/v1/merchants/**", never),
    settle: 1500,
  },
  "restaurant-error": {
    path: "/restaurants/atelier-sidi-yahia",
    stage: (page) => page.route("**/v1/merchants/**", (route) => route.fulfill({ status: 500 })),
  },
  "restaurant-closed": { path: "/restaurants/chez-lalla-tlemcen" },
  "restaurant-sold-out": {
    path: "/restaurants/atelier-sidi-yahia",
    scrollTo: ".restaurant-dish:has(.ui-badge)",
  },
  offline: { path: "/../pwa/{locale}/offline" },
  "slow-network-discover": { path: "/discover", slow: true, settle: 2500 },
  "slow-network-restaurant": {
    path: "/restaurants/atelier-sidi-yahia",
    slow: true,
    settle: 2500,
  },
};

const variants = [
  { name: "ar-390", locale: "ar", width: 390, scheme: "light" },
  { name: "fr-390", locale: "fr", width: 390, scheme: "light" },
  { name: "fr-1280", locale: "fr", width: 1280, scheme: "light" },
  { name: "fr-390-dark", locale: "fr", width: 390, scheme: "dark" },
].filter(({ name }) => only.length === 0 || only.includes(name));

/** Chrome's "Slow 3G" profile: 400 ms latency, about 50 kB/s each way. */
async function throttle(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: 50_000,
    uploadThroughput: 50_000,
  });
}

function urlFor(state, locale) {
  const prefix = locale === "ar" ? "/ar" : `/${locale}`;
  if (state.path.startsWith("/../"))
    return baseUrl + state.path.slice(3).replace("{locale}", locale);
  return baseUrl + prefix + state.path;
}

async function capture(page, { name, state, variant }) {
  if (state.stage) await state.stage(page);
  if (state.slow) await throttle(page);
  await page.goto(urlFor(state, variant.locale), { waitUntil: "commit" });
  if (state.settle) await page.waitForTimeout(state.settle);
  else await page.waitForLoadState("networkidle").catch(() => undefined);
  if (state.scrollTo) {
    await page
      .locator(state.scrollTo)
      .first()
      .evaluate((element) => {
        element.scrollIntoView({ block: "start" });
      });
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${name}-${variant.name}.png` });
}

const browser = await chromium.launch();
for (const variant of variants) {
  for (const [name, state] of Object.entries(states)) {
    const context = await browser.newContext({
      viewport: { width: variant.width, height: variant.width > 600 ? 900 : 844 },
      colorScheme: variant.scheme,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await capture(page, { name, state, variant }).catch((error) => {
      process.stdout.write(`${name} ${variant.name}: ${String(error).slice(0, 120)}\n`);
    });
    await context.close();
  }
}
await browser.close();
process.stdout.write(`captured ${String(variants.length * Object.keys(states).length)}\n`);
