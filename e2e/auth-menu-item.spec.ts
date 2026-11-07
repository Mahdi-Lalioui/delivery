import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemArchiveOutput,
  menuItemAvailabilityOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
} from "../packages/contracts/src/menu.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";

const phone = "+213550000241";
const labels = fr.menuItem;
const categoryDraft = { names: { ar: "الأطباق", fr: "Plats maison" }, availability: null };
const itemDraft = {
  names: { ar: "كسكس بالخضر", fr: "Couscous aux légumes" },
  descriptions: { ar: "كسكس بالخضر الموسمية", fr: "Semoule et légumes de saison" },
  priceDzd: 650,
  photoId: null,
  tags: ["spicy", "vegetarian"],
  extraPrepMinutes: 10,
  optionGroupIds: [],
};
const updatedPrice = 725;

async function signInOwner(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 41");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();

  const memberships = await auth.seedMenuMemberships(phone);
  const owner = memberships.find(({ role }) => role === "owner");
  if (!owner) throw new Error("The item journey needs an approved owner fixture.");
  return owner.merchantId;
}

async function createOwnedCategory(page: Page, origin: string, merchantId: string) {
  const endpoint = `${origin}/v1/merchants/${merchantId}/menu/categories`;
  const get = await page.request.get(endpoint);
  expect(get.status()).toBe(200);
  const menu = menuCategoryPageOutput.parse(await get.json());
  const post = await page.request.post(endpoint, {
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "x-expected-session-id": menu.sessionId,
      "idempotency-key": randomUUID(),
    },
    data: { ...categoryDraft, expectedRevision: menu.revision },
  });
  expect(post.status()).toBe(201);
  const result = menuCategoryWriteOutput.parse(await post.json());
  expect(result.category).toMatchObject(categoryDraft);
  expect(result.revision).toBe(menu.revision + 1);
  return {
    categoryId: result.category.categoryId,
    revision: result.revision,
    sessionId: menu.sessionId,
  };
}

function itemAction(label: string) {
  return label.replace("{name}", itemDraft.names.fr);
}

function itemRow(page: Page, itemId: string) {
  return page.locator(`#menu-item-row-${itemId}`);
}

function observeWrite(page: Page, method: "POST" | "PUT", path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method && new URL(response.url()).pathname === path,
  );
}

async function fillItem(page: Page) {
  await page.getByRole("button", { name: labels.newItem, exact: true }).click();
  const editor = page.getByRole("region", { name: labels.createTitle });
  await editor.getByLabel(labels.nameAr, { exact: true }).fill(itemDraft.names.ar);
  await editor.getByLabel(labels.nameFr, { exact: true }).fill(itemDraft.names.fr);
  await editor.getByLabel(labels.descriptionAr, { exact: true }).fill(itemDraft.descriptions.ar);
  await editor.getByLabel(labels.descriptionFr, { exact: true }).fill(itemDraft.descriptions.fr);
  await editor.getByLabel(labels.price, { exact: true }).fill(String(itemDraft.priceDzd));
  await editor
    .getByLabel(labels.prepMinutes, { exact: true })
    .fill(String(itemDraft.extraPrepMinutes));
  await editor.getByRole("checkbox", { name: labels.spicy, exact: true }).check();
  await editor.getByRole("checkbox", { name: labels.vegetarian, exact: true }).check();
}

async function expectPriceSuffixToStayTogether(page: Page) {
  const suffix = page.locator(".menu-item-money > span");
  await expect(suffix).toHaveText(labels.currency);
  const lines = await suffix.evaluate(async (element) => {
    await document.fonts.ready;
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  expect(lines).toBe(1);
}

test("[MER-09:browser] an owner manages a bilingual item through its lifecycle @menu-items", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const merchantId = await signInOwner(page, auth);
    const { categoryId, revision, sessionId } = await createOwnedCategory(
      page,
      auth.origin,
      merchantId,
    );
    const path = `/v1/merchants/${merchantId}/menu/items`;
    const draft = { ...itemDraft, categoryId };

    await page.goto(`${auth.origin}/fr/merchant/${merchantId}/menu`);
    const manageItems = page.getByRole("link", {
      name: fr.menuCategory.manageItemsLabel.replace("{name}", categoryDraft.names.fr),
      exact: true,
    });
    await expect(manageItems).toBeVisible();
    await manageItems.click();
    await expect(page.getByRole("heading", { name: labels.title, level: 1 })).toBeVisible();
    await expect(page.getByText(labels.empty, { exact: true })).toBeVisible();
    const save = page.getByRole("button", { name: labels.save, exact: true });

    const created = await test.step("Create a bilingual item priced in whole dinars", async () => {
      await fillItem(page);
      const write = observeWrite(page, "POST", path);
      await save.click();
      const response = await write;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toEqual({ ...draft, expectedRevision: revision });
      expect(response.request().headers()["x-expected-session-id"]).toBe(sessionId);
      const created = menuItemWriteOutput.parse(await response.json());
      expect(created.revision).toBe(revision + 1);
      expect(created.item).toMatchObject({ ...draft, isAvailable: true, soldOutUntil: null });
      const row = itemRow(page, created.item.itemId);
      await expect(row.getByRole("heading", { name: draft.names.fr, exact: true })).toBeVisible();
      await expect(row.getByText(draft.descriptions.fr, { exact: true })).toBeVisible();
      await expect(row.getByText(/^650\s+DA$/)).toBeVisible();
      await expect(row.getByText(labels.spicy, { exact: true })).toBeVisible();
      await expect(row.getByText(labels.vegetarian, { exact: true })).toBeVisible();
      return created;
    });

    const original = itemRow(page, created.item.itemId);
    const itemPath = `${path}/${created.item.itemId}`;
    const updated = await test.step("Update the original item’s price", async () => {
      await original
        .getByRole("button", { name: itemAction(labels.editLabel), exact: true })
        .click();
      await expectPriceSuffixToStayTogether(page);
      const price = page.getByLabel(labels.price, { exact: true });
      await expect(price).toHaveValue(String(draft.priceDzd));
      await price.fill(String(updatedPrice));
      const write = observeWrite(page, "PUT", itemPath);
      await save.click();
      const response = await write;
      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON()).toEqual({
        ...draft,
        priceDzd: updatedPrice,
        expectedRevision: created.revision,
      });
      const updated = menuItemWriteOutput.parse(await response.json());
      expect(updated.revision).toBe(created.revision + 1);
      expect(updated.item).toEqual({ ...created.item, priceDzd: updatedPrice });
      await expect(original.getByText(/^725\s+DA$/)).toBeVisible();
      return updated;
    });

    const duplicate = await test.step("Duplicate the edited item", async () => {
      const write = observeWrite(page, "POST", `${itemPath}/duplicate`);
      await original
        .getByRole("button", { name: itemAction(labels.duplicateLabel), exact: true })
        .click();
      const response = await write;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toEqual({ expectedRevision: updated.revision });
      const duplicate = menuItemWriteOutput.parse(await response.json());
      expect(duplicate.revision).toBe(updated.revision + 1);
      expect(duplicate.item.itemId).not.toBe(updated.item.itemId);
      expect(duplicate.item).toEqual({ ...updated.item, itemId: duplicate.item.itemId });
      await expect(itemRow(page, duplicate.item.itemId)).toBeFocused();
      await expect(original).toBeVisible();
      return duplicate;
    });

    const copied = itemRow(page, duplicate.item.itemId);
    const stock = copied.getByRole("combobox", { name: itemAction(labels.availabilityLabel) });
    const soldOut =
      await test.step("Set only the copy sold out until the end of the Algiers day", async () => {
        const write = observeWrite(page, "PUT", `${path}/${duplicate.item.itemId}/availability`);
        await stock.selectOption("end_of_day");
        const response = await write;
        expect(response.status()).toBe(200);
        expect(response.request().postDataJSON()).toEqual({
          availability: "end_of_day",
          expectedRevision: duplicate.revision,
        });
        const soldOut = menuItemAvailabilityOutput.parse(await response.json());
        expect(soldOut).toMatchObject({
          itemId: duplicate.item.itemId,
          isAvailable: false,
          revision: duplicate.revision + 1,
        });
        expect(soldOut.soldOutUntil).not.toBeNull();
        await expect(stock).toHaveValue("end_of_day");
        await expect(copied.getByText(/^Épuisé jusqu’au/)).toBeVisible();
        await expect(original.getByRole("combobox")).toHaveValue("available");
        return soldOut;
      });

    await test.step("Confirm archival of the original and reload the surviving copy", async () => {
      await original
        .getByRole("button", { name: itemAction(labels.archiveLabel), exact: true })
        .click();
      const confirmation = original.getByRole("group", { name: itemAction(labels.archivePrompt) });
      await expect(confirmation.getByRole("button", { name: labels.cancel })).toBeFocused();
      const write = observeWrite(page, "POST", `${itemPath}/archive`);
      await confirmation.getByRole("button", { name: labels.confirmArchive, exact: true }).click();
      const response = await write;
      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON()).toEqual({ expectedRevision: soldOut.revision });
      const archived = menuItemArchiveOutput.parse(await response.json());
      expect(archived).toMatchObject({
        itemId: created.item.itemId,
        revision: soldOut.revision + 1,
      });
      await expect(original).toHaveCount(0);

      const deadline = new Date(soldOut.soldOutUntil ?? "");
      const algerianClock = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Algiers",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
      const untilDeadline = deadline.valueOf() - Date.parse(archived.archivedAt);
      expect(algerianClock.format(deadline)).toBe("00:00:00");
      expect(untilDeadline).toBeGreaterThan(0);
      expect(untilDeadline).toBeLessThanOrEqual(24 * 60 * 60 * 1000);

      await page.reload();
      const list = page.getByRole("list", { name: labels.listTitle, exact: true });
      await expect(list.getByRole("heading", { name: draft.names.fr, exact: true })).toHaveCount(1);
      await expect(original).toHaveCount(0);
      await expect(copied.getByText(/^725\s+DA$/)).toBeVisible();
      await expect(stock).toHaveValue("end_of_day");
      const get = await page.request.get(`${auth.origin}${path}?categoryId=${categoryId}`);
      expect(get.status()).toBe(200);
      const persisted = menuItemPageOutput.parse(await get.json());
      expect(persisted.revision).toBe(archived.revision);
      expect(persisted.items).toEqual([
        { ...duplicate.item, isAvailable: false, soldOutUntil: soldOut.soldOutUntil },
      ]);
    });
  });
});
