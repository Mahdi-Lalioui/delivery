// Audits every customer screen on a running preview build: axe (WCAG 2.2 AA), touch targets
// under 44 px, and interactive elements without a visible focus style.
// Usage: pnpm audit:customer-a11y <baseUrl> [outFile]
import { writeFileSync } from "node:fs";
import process from "node:process";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const [baseUrl = "http://127.0.0.1:3110", outFile] = process.argv.slice(2);

const screens = [
  "/",
  "/discover",
  "/discover?fulfilment=pickup",
  "/restaurants",
  "/restaurants/atelier-sidi-yahia",
  "/sign-in",
  "/account",
  "/dev/screens/checkout",
  "/dev/screens/checkout-payment",
  "/dev/screens/confirmed",
  "/dev/screens/tracking",
  "/dev/screens/tracking-waiting",
  "/dev/screens/tracking-pickup",
  "/dev/screens/rating",
  "/dev/screens/orders",
];
const variants = [
  { locale: "fr", scheme: "light", width: 390 },
  { locale: "ar", scheme: "light", width: 390 },
  { locale: "fr", scheme: "dark", width: 1280 },
  { locale: "ar", scheme: "dark", width: 390 },
];

/**
 * Visible controls smaller than 44 × 44 CSS px that are not inline text links. Runs in the page,
 * so it is passed as source. A stretched link (::after filling its card) counts as its card.
 */
const smallTargets = `(() => {
  const selector = "a[href], button, input:not([type=hidden]), select, textarea, [role=button]";
  const measure = (element) => {
    const after = getComputedStyle(element, "::after");
    const isStretched = after.content !== "none" && after.position === "absolute";
    const card = isStretched ? element.parentElement?.closest("article, li") : null;
    return (element.closest("label") ?? card ?? element).getBoundingClientRect();
  };
  return [...document.querySelectorAll(selector)].flatMap((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width === 0 || style.visibility === "hidden" || style.opacity === "0") return [];
    if (element.matches("p a, li > a:only-child:not([class])")) return [];
    const target = measure(element);
    if (target.width >= 44 && target.height >= 44) return [];
    const name = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
    return [element.tagName.toLowerCase() + ' "' + name.slice(0, 40) + '" ' +
      Math.round(target.width) + "x" + Math.round(target.height)];
  });
})()`;

/** Tabs through the screen and lists controls that show no focus ring when focused. */
async function invisibleFocus(page) {
  const misses = new Set();
  for (let step = 0; step < 30; step += 1) {
    await page.keyboard.press("Tab");
    const miss = await page.evaluate(`(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const parent = element.closest("label, .filter-sheet-toggle, .fulfilment-option");
      const ring = (node) => {
        const look = getComputedStyle(node);
        return look.outlineStyle !== "none" && parseFloat(look.outlineWidth) > 0 ||
          look.boxShadow !== "none";
      };
      if (ring(element) || (parent && ring(parent)) || style.outlineStyle !== "none") return null;
      return element.tagName.toLowerCase() + " " + (element.className || element.id || "");
    })()`);
    if (miss) misses.add(miss);
  }
  return [...misses];
}

async function audit(page, path, variant) {
  const prefix = variant.locale === "ar" ? "/ar" : "/fr";
  await page.goto(`${baseUrl}${prefix}${path === "/" ? "" : path}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude(".maplibregl-canvas")
    .analyze();
  const violations = axe.violations.map(({ id, nodes }) => ({
    id,
    targets: nodes.slice(0, 4).map(({ target }) => target.join(" ")),
  }));
  const targets = await page.evaluate(smallTargets);
  return { violations, smallTargets: targets, invisibleFocus: await invisibleFocus(page) };
}

const browser = await chromium.launch();
const report = [];
for (const variant of variants) {
  const context = await browser.newContext({
    viewport: { width: variant.width, height: 844 },
    colorScheme: variant.scheme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  for (const path of screens) {
    const result = await audit(page, path, variant).catch((error) => ({
      failed: String(error).slice(0, 160),
    }));
    report.push({ path, ...variant, ...result });
  }
  await context.close();
}
await browser.close();
const text = JSON.stringify(report, null, 2);
if (outFile) writeFileSync(outFile, `${text}\n`);
const totals = report.reduce(
  (sum, row) => ({
    violations: sum.violations + (row.violations?.length ?? 0),
    smallTargets: sum.smallTargets + (row.smallTargets?.length ?? 0),
    invisibleFocus: sum.invisibleFocus + (row.invisibleFocus?.length ?? 0),
    failed: sum.failed + (row.failed ? 1 : 0),
  }),
  { violations: 0, smallTargets: 0, invisibleFocus: 0, failed: 0 },
);
process.stdout.write(`${JSON.stringify(totals)}\n`);
