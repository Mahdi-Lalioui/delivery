import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
  menuOptionGroupWriteOutput,
  menuPreviewPageOutput,
} from "../packages/contracts/src/menu.ts";
import { problemResponseSchema } from "../packages/contracts/src/health.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import en from "../packages/i18n/src/messages/en.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const owner = { input: "0550 00 02 71", phone: "+213550000271" };
const admin = { input: "0660 00 02 72", phone: "+213660000272" };
const heldName = "Bière pression sans alcool";
const visibleName = "Citronnade maison";
const groupName = "Taille du verre";
const optionName = "Grand verre";
const reason = "Boisson sans alcool confirmée pour ce plat fictif.";
const messages = { fr, en } as const;
const previewMessages = { ar, fr } as const;

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
  const { item, revision } = menuItemWriteOutput.parse(await itemResponse.json());
  expect(item.moderationStatus).toBe("blocked_pending_review");
  const categoryId = category.category.categoryId;
  await createVisibleItem(page, {
    origin: auth.origin,
    base,
    categoryId,
    sessionId: menu.sessionId,
    revision,
  });
  return { merchantId, categoryId, heldItemId: item.itemId };
}

async function createVisibleItem(
  page: Page,
  {
    origin,
    base,
    categoryId,
    sessionId,
    revision,
  }: {
    origin: string;
    base: string;
    categoryId: string;
    sessionId: string;
    revision: number;
  },
) {
  const groupResponse = await page.request.post(base + "/option-groups", {
    headers: sameOrigin(origin, sessionId),
    data: {
      names: { fr: groupName },
      minimum: 0,
      maximum: 1,
      options: [
        { names: { fr: optionName }, priceDeltaDzd: 30, isDefault: false, isAvailable: true },
      ],
      expectedRevision: revision,
    },
  });
  expect(groupResponse.status()).toBe(201);
  const group = menuOptionGroupWriteOutput.parse(await groupResponse.json());
  const response = await page.request.post(base + "/items", {
    headers: sameOrigin(origin, sessionId),
    data: {
      categoryId,
      names: { fr: visibleName },
      descriptions: { fr: "Boisson au citron préparée sur place" },
      priceDzd: 230,
      photoId: null,
      tags: [],
      extraPrepMinutes: 0,
      optionGroupIds: [group.optionGroup.optionGroupId],
      expectedRevision: group.revision,
    },
  });
  expect(response.status()).toBe(201);
  expect(menuItemWriteOutput.parse(await response.json()).item.moderationStatus).toBe("unreviewed");
}

async function openMenuPreview(page: Page, locale: "ar" | "fr" = "fr") {
  const labels = previewMessages[locale].menuPreview;
  await page.getByRole("button", { name: labels.open, exact: true }).click();
  const preview = page.locator("#menu-preview");
  await expect(preview.getByRole("heading", { name: labels.title, exact: true })).toBeFocused();
  await expect(preview.getByText(visibleName, { exact: true })).toBeVisible();
  return preview;
}

async function expectHeldItemPrivate(
  page: Page,
  { path, categoryId, heldItemId }: { path: string; categoryId: string; heldItemId: string },
) {
  const response = await page.request.get(path + "?categoryId=" + categoryId);
  expect(response.status()).toBe(200);
  const result = menuPreviewPageOutput.parse(await response.json());
  expect(result.items.map(({ names }) => names.fr)).toEqual([visibleName]);
  expect(
    (
      await page.request.get(`${path}/${heldItemId}?expectedRevision=${String(result.revision)}`)
    ).status(),
  ).toBe(404);
}

async function expectHeldTextLocked(
  page: Page,
  {
    origin,
    merchantId,
    categoryId,
    heldItemId,
  }: {
    origin: string;
    merchantId: string;
    categoryId: string;
    heldItemId: string;
  },
) {
  const path = `${origin}/v1/merchants/${merchantId}/menu/items`;
  const snapshot = menuItemPageOutput.parse(
    await (await page.request.get(path + "?categoryId=" + categoryId)).json(),
  );
  const response = await page.request.put(`${path}/${heldItemId}`, {
    headers: sameOrigin(origin, snapshot.sessionId),
    data: {
      categoryId,
      names: { fr: "Bière pression" },
      descriptions: { fr: "Boisson alcoolisée" },
      priceDzd: 200,
      photoId: null,
      tags: [],
      extraPrepMinutes: 0,
      optionGroupIds: [],
      expectedRevision: snapshot.revision,
    },
  });
  expect(response.status()).toBe(409);
  expect(problemResponseSchema.parse(await response.json()).code).toBe("moderation_pending");
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

async function checkPreviewMatrix(page: Page, info: TestInfo, editorUrl: string) {
  for (const locale of ["ar", "fr"] as const) {
    await page.goto(editorUrl.replace("/fr/", `/${locale}/`));
    await openMenuPreview(page, locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const { width, height } of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1280, height: 800 },
      ]) {
        await page.setViewportSize({ width, height });
        await attachPageScreenshot(
          page,
          info,
          `menu-preview-${locale}-${colorScheme}-${String(width)}`,
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target }) => target) })),
        ).toEqual([]);
      }
    }
  }
}

test("[ADM-04:browser] an admin allows a held item and the owner sees it approved @admin-moderation @merchant-design", async ({
  baseURL,
  browser,
  page,
}, info) => {
  await withAuthHarness(baseURL, async (auth) => {
    const { merchantId, categoryId, heldItemId } = await createHeldItem(page, auth);
    const editorUrl = `${auth.origin}/fr/merchant/${merchantId}/menu/${categoryId}/items`;
    await test.step("Keep the held item out of the saved-menu preview", async () => {
      await page.goto(editorUrl);
      const preview = await openMenuPreview(page);
      await expect(preview.getByText(heldName, { exact: true })).toHaveCount(0);
      await expectHeldItemPrivate(page, {
        path: `${auth.origin}/v1/merchants/${merchantId}/menu/preview/items`,
        categoryId,
        heldItemId,
      });
      await preview
        .getByRole("button", { name: fr.menuPreview.details.replace("{name}", visibleName) })
        .click();
      await expect(preview.getByText(groupName, { exact: true })).toBeVisible();
      await expect(preview.getByText(optionName, { exact: true })).toBeVisible();
    });
    const adminContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await enterHeldQueue(adminPage, auth);
      await test.step("Check the theme, locale and viewport matrix", async () => {
        await checkMatrix(adminPage, info);
      });

      await test.step("Require a reason, then allow the item", async () => {
        const row = adminPage.getByRole("row", { name: new RegExp(heldName) });
        await expect(
          row.getByText(fr.adminModeration.categoryAlcohol, { exact: true }),
        ).toBeVisible();
        await row.getByRole("button", { name: heldName, exact: true }).click();
        const details = adminPage.getByRole("region", { name: heldName });
        await expectHeldTextLocked(page, {
          origin: auth.origin,
          merchantId,
          categoryId,
          heldItemId,
        });
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

    await page.goto(editorUrl);
    const list = page.getByRole("list", { name: fr.menuItem.listTitle });
    await expect(list.getByText(heldName, { exact: true })).toBeVisible();
    await expect(list.getByText(fr.menuItem.moderationApproved, { exact: true })).toBeVisible();
    const preview = await openMenuPreview(page);
    await expect(preview.getByText(heldName, { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: fr.menuPreview.close, exact: true }).click();
    await expect(
      page.getByRole("button", { name: fr.menuPreview.open, exact: true }),
    ).toBeFocused();
    await test.step("Check the localized preview design matrix", async () => {
      await checkPreviewMatrix(page, info, editorUrl);
    });
  });
});
