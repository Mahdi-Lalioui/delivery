import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemWriteOutput,
} from "../packages/contracts/src/menu.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const owner = { input: "0550 00 02 81", phone: "+213550000281" };
const listedName = { ar: "كسكس بالخضر", fr: "Couscous aux légumes" };
const heldName = "Bière pression";
const messages = { ar, fr } as const;

async function signIn(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill(owner.input);
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const field = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(field).toBeFocused();
  await field.fill(auth.latestSms(owner.phone));
  await field.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
}

function sameOrigin(origin: string, sessionId: string) {
  return {
    origin,
    "sec-fetch-site": "same-origin",
    "x-expected-session-id": sessionId,
    "idempotency-key": randomUUID(),
  };
}

async function seedMenu(page: Page, auth: AuthHarness) {
  const memberships = await auth.seedMenuMemberships(owner.phone);
  const merchantId = memberships.find(({ role }) => role === "owner")?.merchantId;
  if (!merchantId) throw new Error("The preview journey needs an approved owner fixture.");
  const base = `${auth.origin}/v1/merchants/${merchantId}/menu`;
  const menu = menuCategoryPageOutput.parse(
    await (await page.request.get(base + "/categories")).json(),
  );
  const headers = () => sameOrigin(auth.origin, menu.sessionId);
  const categoryResponse = await page.request.post(base + "/categories", {
    headers: headers(),
    data: { names: { ar: "أطباق", fr: "Plats" }, availability: null, expectedRevision: 0 },
  });
  expect(categoryResponse.status()).toBe(201);
  const { category, revision } = menuCategoryWriteOutput.parse(await categoryResponse.json());
  let expectedRevision = revision;
  for (const names of [listedName, { fr: heldName }]) {
    const response = await page.request.post(base + "/items", {
      headers: headers(),
      data: {
        categoryId: category.categoryId,
        names,
        descriptions: { fr: "Plat fictif de démonstration" },
        priceDzd: 850,
        photoId: null,
        tags: ["spicy"],
        extraPrepMinutes: 0,
        optionGroupIds: [],
        expectedRevision,
      },
    });
    expect(response.status()).toBe(201);
    expectedRevision = menuItemWriteOutput.parse(await response.json()).revision;
  }
  return merchantId;
}

async function checkMatrix(page: Page, info: TestInfo, locale: "ar" | "fr") {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [390, 1280]) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await attachPageScreenshot(page, info, `menu-preview-${locale}-${theme}-${String(width)}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBe(0);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(violations.map(({ id }) => id)).toEqual([]);
    }
  }
}

test("[ADM-04:browser] the customer preview shows listable items and hides a held one @menu-preview", async ({
  baseURL,
  page,
}, info) => {
  await withAuthHarness(baseURL, async (auth) => {
    await signIn(page, auth);
    const merchantId = await seedMenu(page, auth);

    for (const locale of ["fr", "ar"] as const) {
      const text = messages[locale];
      await test.step(`Open the preview from the builder in ${locale}`, async () => {
        await page.goto(`${auth.origin}/${locale}/merchant/${merchantId}/menu`);
        await page.getByRole("link", { name: text.menuCategory.customerPreview }).click();
        await expect(page).toHaveURL(
          `${auth.origin}/${locale}/merchant/${merchantId}/menu/preview`,
        );
        await expect(page.getByRole("heading", { name: text.menuPreview.title })).toBeVisible();
        const preview = page.getByRole("region", { name: text.menuPreview.categories });
        await expect(preview.getByRole("heading", { name: listedName[locale] })).toBeVisible();
        await expect(preview.getByText(text.menuPreview.spicy)).toBeVisible();
        await expect(preview.getByText(heldName)).toHaveCount(0);
      });
      await test.step(`Check the theme and viewport matrix in ${locale}`, async () => {
        await checkMatrix(page, info, locale);
      });
    }
  });
});
