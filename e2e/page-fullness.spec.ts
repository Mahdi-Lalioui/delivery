import { expect, test } from "@playwright/test";
import { fullnessProbe } from "./fullness-probe.ts";

/**
 * DESIGN §0 "full pages": no customer page leaves an empty rectangle over 30 % of the
 * viewport, at the top or at the bottom (where a short page must end on its footer or decor).
 * Runs on the design build, whose screens use fixture data. The full eight-width, two-theme
 * matrix is `pnpm audit:fullness`.
 */
const limit = 0.3;
const routes = [
  "/fr/dev/screens/checkout",
  "/fr/dev/screens/confirmed",
  "/fr/dev/screens/tracking",
  "/fr/dev/screens/rating",
  "/fr/dev/screens/orders",
  "/ar/dev/screens/orders-empty",
  "/ar/dev/screens/checkout-empty",
] as const;

test.describe("customer pages feel full (DESIGN §0)", () => {
  for (const route of routes) {
    test(`${route} leaves no large empty region`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const top = await page.evaluate<number>(fullnessProbe);
      await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      const bottom = await page.evaluate<number>(fullnessProbe);
      expect(top, "largest empty share at the top").toBeLessThanOrEqual(limit);
      expect(bottom, "largest empty share at the bottom").toBeLessThanOrEqual(limit);
    });
  }
});
