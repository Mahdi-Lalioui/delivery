// Measures tap-to-paint latency, frame pacing while scrolling, and CLS on the customer routes,
// on lane A's throttled Android profile (Pixel 7 viewport, 4× CPU, 75 ms, 4/1.5 Mbit/s).
// Usage: pnpm perf:customer-feel <baseUrl> [runs]
import process from "node:process";
import { chromium, devices } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", runsText = "3"] = process.argv.slice(2);
const runs = Number(runsText);

const routes = {
  Discovery: "/fr/discover",
  Restaurant: "/fr/restaurants/atelier-sidi-yahia",
  Checkout: "/fr/dev/screens/checkout-payment",
  Tracking: "/fr/dev/screens/tracking",
};

/** Taps measured per route: a selector and what it stands for. */
const taps = {
  Discovery: [
    [".fulfilment-option:nth-of-type(2)", "Delivery / Pickup switch"],
    [".discovery-cuisine-list li:nth-child(2) .discovery-cuisine", "Cuisine chip"],
    [".restaurant-feed-favourite", "Favourite heart"],
  ],
  Restaurant: [
    [".restaurant-dish-add:not(:disabled)", "Dish + (opens the sheet)"],
    [".restaurant-hours summary", "Opening hours"],
  ],
  Checkout: [[".checkout-promo-open", "Add a promo code"]],
  Tracking: [
    [".tracking-call-restaurant", "Call the restaurant (focus)"],
    [".tracking-map-attribution .awid-map-action", "3D street view"],
  ],
};

const observe = `(() => {
  window.__cls = 0;
  window.__events = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (entry.interactionId) window.__events.push({ name: entry.name, duration: entry.duration });
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
})()`;

async function throttle(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 75,
    downloadThroughput: 500_000,
    uploadThroughput: 187_500,
  });
}

/** Scrolls for ~3 s with the wheel and returns frame times from requestAnimationFrame. */
async function scrollFrames(page) {
  await page.evaluate(`(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__frames.length < 400) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  for (let step = 0; step < 30; step += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
  }
  const frames = await page.evaluate("window.__frames.slice(5)");
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const dropped = frames.filter((time) => time > 1000 / 60 + 4).length / Math.max(1, frames.length);
  const fps = 1000 / (frames.reduce((sum, time) => sum + time, 0) / Math.max(1, frames.length));
  return { fps: Math.round(fps), p95FrameMs: Math.round(p95), droppedShare: dropped };
}

async function tapAll(page, route) {
  const results = [];
  for (const [selector, label] of taps[route] ?? []) {
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) {
      results.push({ label, missing: true });
      continue;
    }
    await target.scrollIntoViewIfNeeded();
    await page.evaluate("window.__events = []");
    await target.tap({ noWaitAfter: true }).catch(() => target.click({ noWaitAfter: true }));
    await page.waitForTimeout(800);
    const events = await page.evaluate("window.__events");
    const worst = Math.max(0, ...events.map(({ duration }) => duration));
    results.push({ label, inputToPaintMs: Math.round(worst) });
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(300);
  }
  return results;
}

async function measure(browser, route) {
  const context = await browser.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
  const page = await context.newPage();
  await page.addInitScript(observe);
  await throttle(page);
  await page.goto(baseUrl + routes[route], { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const frames = await scrollFrames(page);
  await page.evaluate("window.scrollTo(0, 0)");
  await page.waitForTimeout(500);
  const tapResults = await tapAll(page, route);
  const cls = await page.evaluate("window.__cls");
  await context.close();
  return { route, cls: Number(cls.toFixed(3)), ...frames, taps: tapResults };
}

const browser = await chromium.launch();
const report = [];
for (let run = 0; run < runs; run += 1) {
  for (const route of Object.keys(routes))
    report.push({ run: run + 1, ...(await measure(browser, route)) });
}
await browser.close();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
