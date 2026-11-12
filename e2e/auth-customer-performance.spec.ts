import { gzipSync } from "node:zlib";
import { devices, expect, test, type Page } from "@playwright/test";
import { withAuthHarness } from "./auth-fixture.ts";

declare global {
  interface Window {
    awidPaint: { lcp: number; cls: number };
  }
}

// Regression ceilings until these routes meet SPEC's 180 KB target.
const routeBudget = { discovery: 350_000, restaurant: 280_000 };

function collectInitialScripts(page: Page) {
  const initialScripts = new Map<string, Promise<number>>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.ok() && url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js"))
      initialScripts.set(
        url.pathname,
        response.body().then((body) => gzipSync(body).length),
      );
  });

  return initialScripts;
}

for (const route of ["discovery", "restaurant"] as const) {
  test(`[NFR-02] measures connected ${route} on throttled Android @customer-perf`, async ({
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(90_000);
    await withAuthHarness(
      baseURL,
      async (harness) => {
        await harness.seedDiscoveryFeed();
        for (let sample = 1; sample <= 3; sample += 1) {
          const context = await browser.newContext({
            ...devices["Pixel 7"],
            ignoreHTTPSErrors: true,
          });
          try {
            const page = await context.newPage();
            const initialScripts = collectInitialScripts(page);
            const cdp = await context.newCDPSession(page);
            await cdp.send("Network.enable");
            await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
            await cdp.send("Network.emulateNetworkConditions", {
              offline: false,
              latency: 75,
              downloadThroughput: 500_000,
              uploadThroughput: 187_500,
              connectionType: "cellular4g",
            });
            await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
            await page.addInitScript(() => {
              const metrics = { lcp: 0, cls: 0 };
              Object.assign(window, { awidPaint: metrics });
              new PerformanceObserver((entries) => {
                for (const entry of entries.getEntries()) metrics.lcp = entry.startTime;
              }).observe({ type: "largest-contentful-paint", buffered: true });
              new PerformanceObserver((entries) => {
                for (const entry of entries.getEntries()) {
                  if (
                    "value" in entry &&
                    typeof entry.value === "number" &&
                    "hadRecentInput" in entry &&
                    entry.hadRecentInput === false
                  ) {
                    metrics.cls += entry.value;
                  }
                }
              }).observe({ type: "layout-shift", buffered: true });
            });
            const path =
              route === "discovery" ? "/fr/discover" : "/fr/restaurants/fixture-table-safran";
            await page.goto(harness.origin + path, { waitUntil: "domcontentloaded" });
            if (route === "discovery") {
              await expect(page.getByRole("list", { name: "Tous les restaurants" })).toContainText(
                "Table du Safran",
              );
            } else {
              await expect(page.getByRole("heading", { name: /Table du Safran/u })).toBeVisible();
            }
            // Let image, font, and asynchronous content paints settle without scrolling or tapping.
            const paint = await page.evaluate(async () => {
              await new Promise((resolve) => setTimeout(resolve, 1800));
              return window.awidPaint;
            });
            const gzipBytes = (await Promise.all(initialScripts.values())).reduce(
              (sum, bytes) => sum + bytes,
              0,
            );
            expect(gzipBytes).toBeGreaterThan(0);
            expect(gzipBytes, `${route} initial gzip JavaScript`).toBeLessThanOrEqual(
              routeBudget[route],
            );
            const measurements = { ...paint, gzipBytes };
            expect(paint.lcp).toBeGreaterThan(0);
            await info.attach(`${route}-${String(sample)}`, {
              body: JSON.stringify(measurements),
              contentType: "application/json",
            });
            process.stdout.write(JSON.stringify({ route, sample, ...measurements }) + "\n");
          } finally {
            await context.close();
          }
        }
      },
      true,
    );
  });
}
