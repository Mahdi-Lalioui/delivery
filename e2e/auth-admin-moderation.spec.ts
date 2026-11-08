import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemWriteOutput,
} from "../packages/contracts/src/menu.ts";
import en from "../packages/i18n/src/messages/en.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const owner = { input: "0550 00 02 71", phone: "+213550000271" };
const admin = { input: "0660 00 02 72", phone: "+213660000272" };
const heldName = "Bière pression";
const reason = "Boisson sans alcool confirmée pour ce plat fictif.";
const messages = { fr, en } as const;

async function enterOtp(page: Page, auth: AuthHarness, account: typeof owner) {
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill(account.input);
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const field = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(field).toBeFocused();
  await field.fill(auth.latestSms(account.phone));
  await field.press("Enter");
}

function sameOrigin(origin: string, sessionId: string) {
  return {
    origin,
    "sec-fetch-site": "same-origin",
    "x-expected-session-id": sessionId,
    "idempotency-key": randomUUID(),
  };
}

async function createHeldItem(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await enterOtp(page, auth, owner);
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const memberships = await auth.seedMenuMemberships(owner.phone);
  const merchantId = memberships.find(({ role }) => role === "owner")?.merchantId;
  if (!merchantId) throw new Error("The moderation journey needs an approved owner fixture.");

  const base = `${auth.origin}/v1/merchants/${merchantId}/menu`;
  const menu = menuCategoryPageOutput.parse(
    await (await page.request.get(base + "/categories")).json(),
  );
  const categoryResponse = await page.request.post(base + "/categories", {
    headers: sameOrigin(auth.origin, menu.sessionId),
    data: { names: { fr: "Boissons" }, availability: null, expectedRevision: menu.revision },
  });
  expect(categoryResponse.status()).toBe(201);
  const category = menuCategoryWriteOutput.parse(await categoryResponse.json());
  const itemResponse = await page.request.post(base + "/items", {
    headers: sameOrigin(auth.origin, menu.sessionId),
    data: {
      categoryId: category.category.categoryId,
      names: { fr: heldName },
      descriptions: { fr: "Boisson fraîche maison" },
      priceDzd: 200,
      photoId: null,
      tags: [],
      extraPrepMinutes: 0,
      optionGroupIds: [],
      expectedRevision: category.revision,
    },
  });
  expect(itemResponse.status()).toBe(201);
  const item = menuItemWriteOutput.parse(await itemResponse.json()).item;
  expect(item.moderationStatus).toBe("blocked_pending_review");
  return { merchantId, categoryId: category.category.categoryId };
}

async function enterHeldQueue(page: Page, auth: AuthHarness) {
  const totp = await auth.seedAdmin(admin.phone);
  await page.goto(auth.origin + "/fr/sign-in?continue=admin-moderation");
  await expect(page.getByRole("heading", { name: fr.auth.adminTitle })).toBeVisible();
  await enterOtp(page, auth, admin);
  const factor = page.getByRole("textbox", { name: fr.auth.totpLabel });
  await expect(factor).toBeFocused();
  await factor.fill(totp());
  await factor.press("Enter");
  await page.getByRole("link", { name: fr.auth.continueModeration }).click();
  await expect(page).toHaveURL(auth.origin + "/fr/admin/menu-items");
  await expect(page.getByRole("heading", { name: fr.adminModeration.title })).toBeVisible();
}

async function checkMatrix(page: Page, info: TestInfo) {
  for (const locale of ["fr", "en"] as const) {
    await page.goto(page.url().replace(/\/(fr|en)\//, `/${locale}/`));
    await page.getByRole("button", { name: heldName, exact: true }).click();
    await expect(
      page.getByRole("radio", { name: messages[locale].adminModeration.approve }),
    ).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      for (const width of [390, 1280]) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await attachPageScreenshot(
          page,
          info,
          `admin-moderation-${locale}-${theme}-${String(width)}`,
        );
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        expect(overflow).toBe(0);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(violations.map(({ id }) => id)).toEqual([]);
      }
    }
  }
  await page.goto(page.url().replace("/en/", "/fr/"));
}

test("[ADM-04:browser] an admin allows a held item and the owner sees it approved @admin-moderation", async ({
  baseURL,
  browser,
  page,
}, info) => {
  await withAuthHarness(baseURL, async (auth) => {
    const { merchantId, categoryId } = await createHeldItem(page, auth);
    const adminContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await enterHeldQueue(adminPage, auth);
      await test.step("Check the theme, locale and viewport matrix", async () => {
        await checkMatrix(adminPage, info);
      });

      await test.step("Require a reason, then allow the item", async () => {
        const row = adminPage.getByRole("row", { name: new RegExp(heldName) });
        await expect(row.getByText(fr.adminModeration.categoryAlcohol)).toBeVisible();
        await row.getByRole("button", { name: heldName, exact: true }).click();
        const details = adminPage.getByRole("region", { name: heldName });
        await details.getByRole("radio", { name: fr.adminModeration.approve }).check();
        await details.getByRole("button", { name: fr.adminModeration.confirm }).click();
        const reasonField = details.getByLabel(fr.adminModeration.reason, { exact: true });
        await expect(reasonField).toBeFocused();
        await expect(details.getByText(fr.adminModeration.reasonError)).toBeVisible();
        await reasonField.fill(reason);
        await details.getByRole("button", { name: fr.adminModeration.confirm }).click();
        await expect(adminPage.getByRole("status")).toHaveText(fr.adminModeration.approved);
        await expect(
          adminPage.getByRole("heading", { name: fr.adminModeration.title }),
        ).toBeFocused();
        await expect(adminPage.getByText(fr.adminModeration.empty)).toBeVisible();
      });
    } finally {
      await adminContext.close();
    }

    await page.goto(`${auth.origin}/fr/merchant/${merchantId}/menu/${categoryId}/items`);
    const list = page.getByRole("list", { name: fr.menuItem.listTitle });
    await expect(list.getByText(heldName, { exact: true })).toBeVisible();
    await expect(list.getByText(fr.menuItem.moderationApproved, { exact: true })).toBeVisible();
  });
});
