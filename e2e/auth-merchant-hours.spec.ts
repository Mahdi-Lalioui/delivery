import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  merchantHoursOutput,
  merchantHoursPreviewOutput,
} from "../packages/contracts/src/merchant-hours.ts";
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

async function saveSpecialDates(page: Page, labels: Labels) {
  await page.getByRole("button", { name: labels.save, exact: true }).click();
  await expect(page.getByText(labels.saved, { exact: true })).toBeVisible();
}

async function testSpecialDate(
  page: Page,
  info: TestInfo,
  { locale, previewUrl }: { locale: Locale; previewUrl: string },
) {
  const labels = messages[locale].merchantHours;
  await page.getByRole("button", { name: labels.previewRegular, exact: true }).click();
  const response = await page.request.get(previewUrl);
  expect(response.ok()).toBe(true);
  const preview = merchantHoursPreviewOutput.parse(await response.json());
  const thursday = preview.days.find(({ date }) => new Date(date).getUTCDay() === 4);
  if (!thursday) throw new Error("The seven-day preview must include Thursday.");

  const exceptions = page.getByRole("group", { name: labels.specialDatesLegend, exact: true });
  const add = exceptions.getByRole("button", { name: labels.addSpecialDate, exact: true });
  await expect(add).toBeVisible();
  await add.click();
  const date = exceptions.getByLabel(labels.specialDateLabel, { exact: true });
  await expect(date).toBeFocused();
  await date.fill(thursday.date);
  await saveSpecialDates(page, labels);
  await expect(previewDay(page, labels)).toContainText(labels.previewSpecial);
  await expect(previewDay(page, labels)).toContainText(labels.closedDay);
  await page.reload();
  await expect(date).toHaveValue(thursday.date);

  await exceptions.getByRole("button", { name: labels.addRange, exact: true }).click();
  const opens = exceptions.getByLabel(labels.opensLabel, { exact: true });
  await expect(opens).toBeFocused();
  await opens.fill("19:00");
  const closes = exceptions.getByLabel(labels.closesLabel, { exact: true });
  await closes.fill("01:00");
  await saveSpecialDates(page, labels);
  await expect(previewDay(page, labels)).toContainText(
    fill(labels.previewRangeNextDay, {
      opens: formatAlgiersTime(Date.parse("2026-01-01T19:00:00+01:00"), locale),
      closes: formatAlgiersTime(Date.parse("2026-01-01T01:00:00+01:00"), locale),
    }),
  );
  await page.reload();
  await expect(date).toHaveValue(thursday.date);
  await expect(opens).toHaveValue("19:00");
  await expect(closes).toHaveValue("01:00");
  await test.step("Check the theme and viewport matrix with a saved exception", async () => {
    await checkMatrix(page, info, locale);
  });

  await exceptions.getByRole("button", { name: labels.removeSpecialDate, exact: true }).click();
  await expect(add).toBeFocused();
  await saveSpecialDates(page, labels);
  await page.reload();
  await expect(date).toHaveCount(0);
  await expect(previewDay(page, labels)).not.toContainText(labels.previewSpecial);
  await expect(previewDay(page, labels)).toContainText(
    fill(labels.previewRangeNextDay, {
      opens: formatAlgiersTime(at1800, locale),
      closes: formatAlgiersTime(at0200, locale),
    }),
  );
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
    for (const { width, height } of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height });
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
      await test.step("Create, edit and delete a dated hours exception", async () => {
        await testSpecialDate(page, info, {
          locale,
          previewUrl: `${auth.origin}/v1/merchants/${merchantId}/hours/preview?schedule=regular`,
        });
      });
    });
  });
}

async function saveExceptionFromAnotherTab(page: Page, origin: string, url: string) {
  const loaded = await page.request.get(url);
  expect(loaded.ok()).toBe(true);
  const { weekly, sessionId, revision } = merchantHoursOutput.parse(await loaded.json());
  const saved = await page.request.put(url, {
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "x-expected-session-id": sessionId,
      "idempotency-key": randomUUID(),
    },
    data: {
      weekly,
      specialDates: [{ date: "2030-01-01", ranges: [] }],
      expectedRevision: revision,
    },
  });
  expect(saved.status()).toBe(200);
}

test("[MER-15:browser] a newer Ramadan read cannot let stale hours overwrite another tab's exception @merchant-hours", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const merchantId = await signInOwner(page, auth);
    const url = `${auth.origin}/v1/merchants/${merchantId}/hours`;
    const ramadanRead = Promise.withResolvers<undefined>();
    const labels = fr.merchantHours;
    await page.route("**" + new URL(url).pathname + "/ramadan", async (route) => {
      if (route.request().method() === "GET") await ramadanRead.promise;
      await route.continue();
    });
    try {
      await page.goto(`${auth.origin}/fr/merchant/${merchantId}/hours`);
      await expect(
        page.getByRole("group", { name: labels.weeklyLegend, exact: true }),
      ).toBeVisible();
      await saveExceptionFromAnotherTab(page, auth.origin, url);
    } finally {
      ramadanRead.resolve(undefined);
    }

    await saveRamadanRange(page, labels);
    const dates = page.getByRole("group", { name: labels.specialDatesLegend, exact: true });
    await dates.getByRole("button", { name: labels.addSpecialDate, exact: true }).click();
    await dates.getByLabel(labels.specialDateLabel, { exact: true }).fill("2030-01-02");
    const attempt = page.waitForResponse(
      (response) => response.url() === url && response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: labels.save, exact: true }).click();
    expect((await attempt).status()).toBe(409);
    await expect(page.getByText(labels.revisionConflict, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: labels.reload, exact: true })).toBeFocused();

    const readback = await page.request.get(url);
    expect(readback.ok()).toBe(true);
    expect(merchantHoursOutput.parse(await readback.json()).specialDates).toEqual([
      { date: "2030-01-01", ranges: [] },
    ]);
  });
});
