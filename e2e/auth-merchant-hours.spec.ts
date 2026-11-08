import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { formatAlgiersTime } from "../packages/i18n/src/formats.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const phone = "+213550000261";
const messages = { ar, fr } as const;
type Locale = keyof typeof messages;
type Labels = (typeof fr)["merchantHours"];

// Africa/Algiers is UTC+01:00 all year, so these instants carry fixed local times.
const at1800 = Date.parse("2026-01-01T18:00:00+01:00");
const at0200 = Date.parse("2026-01-01T02:00:00+01:00");

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

async function signInOwner(page: Page, auth: AuthHarness): Promise<string> {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 61");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const memberships = await auth.seedMenuMemberships(phone);
  const owner = memberships.find(({ role }) => role === "owner");
  if (!owner) throw new Error("The hours journey needs an approved owner fixture.");
  return owner.merchantId;
}

function day(form: Locator, labels: Labels, weekday: "thursday"): Locator {
  return form.getByRole("group", { name: labels.weekdays[weekday], exact: true });
}

function previewDay(page: Page, labels: Labels): Locator {
  const preview = page.getByRole("region", { name: labels.previewTitle });
  const heading = page.getByRole("heading", { name: new RegExp("^" + labels.weekdays.thursday) });
  return preview.getByRole("listitem").filter({ has: heading });
}

async function saveWeeklyOvernight(page: Page, labels: Labels, locale: Locale) {
  const week = page.getByRole("group", { name: labels.weeklyLegend, exact: true });
  const thursday = day(week, labels, "thursday");
  await thursday.getByRole("button", { name: labels.addRange, exact: true }).click();
  const opens = thursday.getByLabel(labels.opensLabel, { exact: true });
  await expect(opens).toBeFocused();
  await opens.fill("18:00");
  await thursday.getByLabel(labels.closesLabel, { exact: true }).fill("02:00");
  await expect(thursday.getByText(labels.overnight, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: labels.save, exact: true }).click();
  await expect(page.getByText(labels.saved, { exact: true })).toBeVisible();
  const times = {
    opens: formatAlgiersTime(at1800, locale),
    closes: formatAlgiersTime(at0200, locale),
  };
  await expect(previewDay(page, labels)).toContainText(fill(labels.previewRangeNextDay, times));
}

async function saveRamadanRange(page: Page, labels: Labels) {
  const ramadan = page.getByRole("group", { name: labels.ramadanLegend, exact: true });
  const thursday = day(ramadan, labels, "thursday");
  await thursday.getByRole("button", { name: labels.addRange, exact: true }).click();
  await expect(thursday.locator("#ramadan-4-0-opens-kind")).toBeFocused();
  await thursday.locator("#ramadan-4-0-opens-offset").fill("-30");
  await expect(thursday.locator("#ramadan-4-0-closes-time")).toHaveValue("02:00");
  const form = page.locator("form", { has: ramadan });
  await form.getByRole("button", { name: labels.saveRamadan, exact: true }).click();
  await expect(form.locator("[data-ramadan-save]")).toBeFocused();
  await expect(form.getByText(labels.saved, { exact: true })).toBeVisible();
}

async function expectRamadanPreview(page: Page, labels: Labels, locale: Locale) {
  await page.getByRole("button", { name: labels.previewRamadan, exact: true }).click();
  await expect(page.locator('[data-preview="ramadan"]')).toHaveAttribute("aria-pressed", "true");
  const thursday = previewDay(page, labels);
  await expect(thursday).toContainText(fill(labels.previewMaghrib, { time: "" }).trim());
  const closes = formatAlgiersTime(at0200, locale);
  const nextDay = fill(labels.previewRangeNextDay, { opens: "", closes }).replace(/^–/, "");
  await expect(thursday).toContainText(nextDay);
}

async function checkMatrix(page: Page, info: TestInfo, locale: Locale) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [390, 1280]) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await attachPageScreenshot(page, info, `merchant-hours-${locale}-${theme}-${String(width)}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBe(0);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) })),
      ).toEqual([]);
    }
  }
}

for (const locale of ["ar", "fr"] as const) {
  test(`[MER-15:browser] [MER-16:browser] ${locale} owner saves overnight and Ramadan hours @merchant-hours`, async ({
    baseURL,
    page,
  }, info) => {
    const labels = messages[locale].merchantHours;
    await withAuthHarness(baseURL, async (auth) => {
      const merchantId = await signInOwner(page, auth);
      await page.goto(`${auth.origin}/${locale}/merchant/${merchantId}/hours`);
      await expect(page.getByRole("heading", { name: labels.title, level: 1 })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

      await test.step("Save an overnight Thursday range", async () => {
        await saveWeeklyOvernight(page, labels, locale);
      });
      await test.step("Save a Maghrib-relative Ramadan range", async () => {
        await saveRamadanRange(page, labels);
        await expectRamadanPreview(page, labels, locale);
      });
      await test.step("Read both schedules back after a reload", async () => {
        await page.reload();
        const week = page.getByRole("group", { name: labels.weeklyLegend, exact: true });
        await expect(day(week, labels, "thursday").getByLabel(labels.opensLabel)).toHaveValue(
          "18:00",
        );
        await expect(page.locator("#ramadan-4-0-opens-offset")).toHaveValue("-30");
        await expectRamadanPreview(page, labels, locale);
      });
      await test.step("Check the theme and viewport matrix", async () => {
        await checkMatrix(page, info, locale);
      });
    });
  });
}
