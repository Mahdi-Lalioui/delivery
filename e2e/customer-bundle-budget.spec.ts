import { gzipSync } from "node:zlib";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { loopbackOrigin, productionPort } from "./ports.ts";

const productionUrl = loopbackOrigin(productionPort);

/** SPEC NFR-02: initial JS per customer route ≤ 180 KB gzip; maps, 3D and schemas load later. */
const initialBudgetBytes = 180_000;
const customerRoutes = [
  "/fr",
  "/fr/discover",
  "/fr/restaurants/budget-check",
  "/fr/checkout",
  "/fr/orders",
] as const;

/**
 * Initial JS is every module script the server HTML references: what a modern browser must
 * download and run before the page is interactive. `noModule` scripts (legacy polyfills) are
 * skipped because module-capable browsers never fetch them.
 */
async function initialScriptBytes(request: APIRequestContext, path: string) {
  const html = await (await request.get(productionUrl + path)).text();
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/gu)];
  const sources = new Set(
    tags.filter(([tag]) => !/\bnoModule\b/iu.test(tag)).map(([, source]) => source ?? ""),
  );
  let total = 0;
  for (const source of sources) {
    const body = await (await request.get(productionUrl + source)).body();
    total += gzipSync(body).length;
  }
  return { total, scripts: sources.size };
}

test.describe("[NFR-02] customer route bundle budgets", () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "Byte counts do not depend on the browser; one project measures them.",
  );

  for (const path of customerRoutes) {
    test(`[NFR-02] ${path} ships at most 180 KB of initial JS`, async ({ request }) => {
      const { total, scripts } = await initialScriptBytes(request, path);
      test.info().annotations.push({ type: "initial-js-gzip", description: String(total) });
      expect(scripts).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(initialBudgetBytes);
    });
  }
});
