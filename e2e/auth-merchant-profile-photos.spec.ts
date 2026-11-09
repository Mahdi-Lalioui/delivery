import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { merchantProfilePhotosOutput } from "../packages/contracts/src/merchant.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPhoto } from "./media-photo-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const phone = "+213550000281";
const labels = fr.merchantProfilePhotos;
const translations = { ar, fr } as const;

async function enterSetup(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 81");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const owner = (await auth.seedMenuMemberships(phone)).find(({ role }) => role === "owner");
  if (!owner) throw new Error("Expected an approved restaurant owner fixture.");
  await page.goto(`${auth.origin}/fr/merchant/${owner.merchantId}/setup`);
  await page.getByRole("link", { name: labels.manage, exact: true }).click();
  await expect(page.getByRole("heading", { name: labels.title, exact: true })).toBeVisible();
  return owner.merchantId;
}

function photoFields(page: Page, locale: keyof typeof translations) {
  const messages = translations[locale].merchantProfilePhotos;
  return {
    cover: page.getByRole("group", { name: messages.cover, exact: true }),
    logo: page.getByRole("group", { name: messages.logo, exact: true }),
  };
}

async function expectSavedPhotos(page: Page, locale: keyof typeof translations) {
  const { cover, logo } = photoFields(page, locale);
  const name = translations[locale].mediaPhoto.selectedPreview;
  for (const [field, ratio] of [
    [cover, 16 / 9],
    [logo, 1],
  ] as const) {
    const image = field.getByRole("img", { name, exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth / element.naturalHeight),
      )
      .toBeCloseTo(ratio, 4);
  }
}

async function saveProfile(page: Page, path: string) {
  const write = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: labels.save, exact: true }).click();
  const response = await write;
  expect(response.status()).toBe(200);
  await expect(page.getByText(labels.saved, { exact: true })).toBeVisible();
  return merchantProfilePhotosOutput.parse(await response.json());
}

async function checkProfileMatrix(page: Page, info: TestInfo, url: string) {
  for (const locale of ["ar", "fr"] as const) {
    await page.goto(url.replace("/fr/", `/${locale}/`));
    await expectSavedPhotos(page, locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await attachPageScreenshot(
          page,
          info,
          `profile-photos-${locale}-${theme}-${String(width)}`,
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(violations.map(({ id }) => id)).toEqual([]);
      }
    }
  }
}

test("[MER-14] crops, saves and removes restaurant cover and logo @merchant-photos @merchant-design", async ({
  baseURL,
  page,
}, info) => {
  test.setTimeout(90_000);
  await withAuthHarness(
    baseURL,
    async (auth) => {
      const merchantId = await enterSetup(page, auth);
      const path = `/v1/merchants/${merchantId}/profile/photos`;
      const save = page.getByRole("button", { name: labels.save, exact: true });
      const fields = photoFields(page, "fr");
      const fixtureDirectory = new URL("../packages/db/fixtures/demo-menu/", import.meta.url);
      const coverPhotoId = await attachPhoto(page, fr.mediaPhoto, {
        save,
        field: fields.cover,
        buffer: await readFile(new URL("algerian.png", fixtureDirectory)),
      });
      const logoPhotoId = await attachPhoto(page, fr.mediaPhoto, {
        save,
        field: fields.logo,
        buffer: await readFile(new URL("bakery.png", fixtureDirectory)),
      });
      expect(await saveProfile(page, path)).toMatchObject({ coverPhotoId, logoPhotoId });
      await page.reload();
      await expectSavedPhotos(page, "fr");
      await checkProfileMatrix(page, info, page.url());

      await fields.cover.getByRole("button", { name: fr.mediaPhoto.remove, exact: true }).click();
      expect(await saveProfile(page, path)).toMatchObject({ coverPhotoId: null, logoPhotoId });
      await page.reload();
      await expect(
        fields.cover.getByRole("img", { name: fr.mediaPhoto.selectedPreview }),
      ).toHaveCount(0);
      await expect(
        fields.logo.getByRole("img", { name: fr.mediaPhoto.selectedPreview }),
      ).toBeVisible();
    },
    true,
  );
});
