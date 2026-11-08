import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemWriteOutput,
} from "../packages/contracts/src/menu.ts";
import {
  bulkPriceApplyOutput,
  bulkPricePreviewOutput,
  bulkPriceUndoOutput,
} from "../packages/contracts/src/menu-price.ts";
import { formatDzd } from "../packages/i18n/src/formats.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";

const phone = "+213550000243";
const labels = fr.menuPrice;
const categoryNames = { ar: "المشاوي", fr: "Grillades maison" };
const undoWindowMs = 10 * 60 * 1_000;

async function signInOwner(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 43");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const memberships = await auth.seedMenuMemberships(phone);
  const owner = memberships.find(({ role }) => role === "owner");
  if (!owner) throw new Error("The bulk price journey needs an approved owner fixture.");
  return owner.merchantId;
}

function commandHeaders(origin: string, sessionId: string) {
  return {
    origin,
    "sec-fetch-site": "same-origin",
    "x-expected-session-id": sessionId,
    "idempotency-key": randomUUID(),
  };
}

async function seedMenu(page: Page, origin: string, merchantId: string) {
  const menuPath = `${origin}/v1/merchants/${merchantId}/menu`;
  const menu = menuCategoryPageOutput.parse(
    await (await page.request.get(menuPath + "/categories")).json(),
  );
  const category = await page.request.post(menuPath + "/categories", {
    headers: commandHeaders(origin, menu.sessionId),
    data: { names: categoryNames, availability: null, expectedRevision: menu.revision },
  });
  expect(category.status()).toBe(201);
  const { category: created, revision } = menuCategoryWriteOutput.parse(await category.json());
  let expectedRevision = revision;
  const itemIds: string[] = [];
  for (const [nameFr, priceDzd] of [
    ["Brochettes", 650],
    ["Merguez", 1_200],
  ] as const) {
    const response = await page.request.post(menuPath + "/items", {
      headers: commandHeaders(origin, menu.sessionId),
      data: {
        categoryId: created.categoryId,
        names: { ar: "طبق " + nameFr, fr: nameFr },
        descriptions: { fr: "Plat fictif grillé" },
        priceDzd,
        photoId: null,
        tags: [],
        extraPrepMinutes: 0,
        optionGroupIds: [],
        expectedRevision,
      },
    });
    expect(response.status()).toBe(201);
    const item = menuItemWriteOutput.parse(await response.json());
    expectedRevision = item.revision;
    itemIds.push(item.item.itemId);
  }
  return { categoryId: created.categoryId, itemIds };
}

function observe(page: Page, path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === path,
  );
}

function price(page: Page, itemId: string, amount: number) {
  return page
    .locator(`#menu-item-row-${itemId}`)
    .getByText(formatDzd(amount, "fr"), { exact: true });
}

test("[MER-11:browser] an owner previews, applies and undoes a bulk price change @menu-prices", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const merchantId = await signInOwner(page, auth);
    const { categoryId, itemIds } = await seedMenu(page, auth.origin, merchantId);
    const [first = "", second = ""] = itemIds;
    const pricesPath = `/v1/merchants/${merchantId}/menu/prices`;
    await page.goto(`${auth.origin}/fr/merchant/${merchantId}/menu/${categoryId}/items`);
    const panel = page.getByRole("region", { name: labels.title });
    await expect(panel).toBeVisible();
    const undo = panel.getByRole("button", { name: labels.undo, exact: true });

    await test.step("Preview a 10% raise for the whole category", async () => {
      await panel.getByRole("checkbox", { name: labels.selectAll, exact: true }).check();
      await panel.getByLabel(labels.amountLabel, { exact: true }).fill("10");
      const read = observe(page, pricesPath + "/preview");
      await panel.getByRole("button", { name: labels.preview, exact: true }).click();
      const response = await read;
      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON()).toEqual({
        itemIds: [first, second],
        adjustment: { kind: "percent", basisPoints: 1_000 },
        roundingUnit: 10,
      });
      const preview = bulkPricePreviewOutput.parse(await response.json());
      expect(preview.items.map((item) => item.newPriceDzd)).toEqual([720, 1_320]);
      await expect(panel.getByRole("table", { name: labels.previewCaption })).toBeVisible();
      await expect(price(page, first, 650)).toBeVisible();
    });

    await test.step("Apply the previewed prices and undo them", async () => {
      const write = observe(page, pricesPath + "/apply");
      await panel.getByRole("button", { name: labels.apply, exact: true }).click();
      const applied = bulkPriceApplyOutput.parse(await (await write).json());
      await expect(panel.getByRole("status")).toHaveText(labels.applied);
      await expect(price(page, first, 720)).toBeVisible();
      await expect(price(page, second, 1_320)).toBeVisible();

      const reverse = observe(page, `${pricesPath}/batches/${applied.batchId}/undo`);
      await undo.click();
      const response = await reverse;
      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON()).toEqual({ expectedRevision: applied.revision });
      bulkPriceUndoOutput.parse(await response.json());
      await expect(panel.getByRole("status")).toHaveText(labels.undone);
      await expect(price(page, first, 650)).toBeVisible();
      await expect(price(page, second, 1_200)).toBeVisible();
    });

    await test.step("Reject an undo once the server's ten minutes have passed", async () => {
      await panel.getByRole("button", { name: labels.newChange, exact: true }).click();
      await panel.getByRole("checkbox", { name: /^Brochettes/ }).check();
      await panel.getByRole("radio", { name: labels.fixed, exact: true }).check();
      await panel.getByLabel(labels.amountLabel, { exact: true }).fill("50");
      await panel.getByRole("button", { name: labels.preview, exact: true }).click();
      const write = observe(page, pricesPath + "/apply");
      await panel.getByRole("button", { name: labels.apply, exact: true }).click();
      const applied = bulkPriceApplyOutput.parse(await (await write).json());
      await expect(price(page, first, 700)).toBeVisible();

      auth.advanceClock(undoWindowMs + 1);
      const reverse = observe(page, `${pricesPath}/batches/${applied.batchId}/undo`);
      await undo.click();
      expect((await reverse).status()).toBe(409);
      await expect(panel.getByRole("alert")).toHaveText(labels.failureUndoExpired);
      await expect(undo).toHaveCount(0);
      await expect(price(page, first, 700)).toBeVisible();
    });
  });
});
