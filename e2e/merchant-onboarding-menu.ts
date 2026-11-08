import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemWriteOutput,
  menuOptionGroupWriteOutput,
  menuPreviewPageOutput,
} from "../packages/contracts/src/menu.ts";
import { menuImportColumns } from "../packages/contracts/src/menu-import.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { attachPhoto } from "./media-photo-fixture.ts";

const categoryNames = { ar: "أطباق البيت", fr: "Plats maison" };
const signatureNames = { ar: "طبق الدار", fr: "Assiette de la maison" };
const descriptions = { ar: "طبق منزلي تجريبي", fr: "Plat maison fictif" };
const importedName = "Chorba maison";
const groupName = "Accompagnement maison";
const optionName = "Pain de la maison";

async function writeMenu(
  page: Page,
  { url, sessionId }: { url: string; sessionId: string },
  data: object,
) {
  const response = await page.request.post(url, {
    headers: {
      origin: new URL(url).origin,
      "sec-fetch-site": "same-origin",
      "x-expected-session-id": sessionId,
      "idempotency-key": randomUUID(),
    },
    data,
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  return body;
}

function observeCreated(page: Page, path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === path,
  );
}

async function createCategory(page: Page, menuPage: string, path: string) {
  const labels = fr.menuCategory;
  await page.goto(menuPage);
  await page.getByRole("button", { name: labels.newCategory, exact: true }).click();
  await page.getByLabel(labels.nameAr, { exact: true }).fill(categoryNames.ar);
  await page.getByLabel(labels.nameFr, { exact: true }).fill(categoryNames.fr);
  const request = observeCreated(page, path);
  await page.getByRole("button", { name: labels.save, exact: true }).click();
  const response = await request;
  expect(response.status()).toBe(201);
  const created = menuCategoryWriteOutput.parse(await response.json());
  expect(created.category.names).toEqual(categoryNames);
  return created.category.categoryId;
}

async function createReusableOption(page: Page, path: string) {
  const labels = fr.menuOptionGroup;
  await page.getByRole("link", { name: fr.menuCategory.optionLibrary, exact: true }).click();
  await page.getByRole("button", { name: labels.newGroup, exact: true }).click();
  const editor = page.getByRole("region", { name: labels.createTitle });
  const names = editor.getByRole("group", { name: labels.names, exact: true });
  await names.getByLabel(labels.nameAr, { exact: true }).fill("إضافة منزلية");
  await names.getByLabel(labels.nameFr, { exact: true }).fill(groupName);
  await editor.getByLabel(labels.minimum, { exact: true }).fill("0");
  await editor.getByLabel(labels.maximum, { exact: true }).fill("1");
  const row = editor.getByRole("list", { name: labels.options }).getByRole("listitem").first();
  await row.getByLabel(labels.nameAr, { exact: true }).fill("خبز الدار");
  await row.getByLabel(labels.nameFr, { exact: true }).fill(optionName);
  await row.getByLabel(labels.priceDelta, { exact: true }).fill("30");
  const request = observeCreated(page, path);
  await editor.getByRole("button", { name: labels.save, exact: true }).click();
  const response = await request;
  expect(response.status()).toBe(201);
  const group = menuOptionGroupWriteOutput.parse(await response.json());
  expect(group.optionGroup.options[0]?.names.fr).toBe(optionName);
  return group.revision;
}

async function createMenuFixtures(page: Page, root: string, menuPage: string) {
  const current = await page.request.get(root + "/categories");
  const { sessionId, categories } = menuCategoryPageOutput.parse(await current.json());
  expect(categories).toEqual([]);
  const { pathname } = new URL(root);
  const categoryId = await createCategory(page, menuPage, pathname + "/categories");
  let expectedRevision = await createReusableOption(page, pathname + "/option-groups");
  for (let index = 1; index <= 9; index += 1) {
    const number = String(index);
    const item = menuItemWriteOutput.parse(
      await writeMenu(
        page,
        {
          url: root + "/items",
          sessionId,
        },
        {
          categoryId,
          names: { ar: "طبق تجريبي " + number, fr: "Plat fictif " + number },
          descriptions,
          priceDzd: 500,
          tags: [],
          photoId: null,
          optionGroupIds: [],
          extraPrepMinutes: 0,
          expectedRevision,
        },
      ),
    );
    expectedRevision = item.revision;
  }
  return categoryId;
}

async function createSignatureDish(page: Page, itemPage: string) {
  await page.goto(itemPage);
  const labels = fr.menuItem;
  await page.getByRole("button", { name: labels.newItem, exact: true }).click();
  const editor = page.getByRole("region", { name: labels.createTitle });
  await editor.getByLabel(labels.nameAr, { exact: true }).fill(signatureNames.ar);
  await editor.getByLabel(labels.nameFr, { exact: true }).fill(signatureNames.fr);
  await editor.getByLabel(labels.descriptionAr, { exact: true }).fill(descriptions.ar);
  await editor.getByLabel(labels.descriptionFr, { exact: true }).fill(descriptions.fr);
  await editor.getByLabel(labels.price, { exact: true }).fill("600");
  const picker = editor.getByRole("combobox", { name: labels.optionGroupsAvailable });
  await picker.selectOption({ label: groupName });
  await editor.getByRole("button", { name: labels.optionGroupsAdd }).click();
  const save = editor.getByRole("button", { name: labels.save, exact: true });
  const photoId = await attachPhoto(page, fr.mediaPhoto, { save, field: editor });
  await save.click();
  await expect(page.getByRole("heading", { name: signatureNames.fr, exact: true })).toBeVisible();
  return photoId;
}

async function applyBulkPrices(page: Page) {
  const labels = fr.menuPrice;
  const panel = page.getByRole("region", { name: labels.title });
  await panel.getByRole("checkbox", { name: labels.selectAll, exact: true }).check();
  await panel.getByLabel(labels.amountLabel, { exact: true }).fill("10");
  await panel.getByRole("button", { name: labels.preview, exact: true }).click();
  await expect(panel.getByRole("table", { name: labels.previewCaption })).toBeVisible();
  await panel.getByRole("button", { name: labels.apply, exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(labels.applied);
}

async function importChorba(page: Page, menuPage: string) {
  await page.goto(menuPage);
  await page.getByRole("button", { name: fr.menuCategory.importMenu, exact: true }).click();
  const labels = fr.menuImport;
  const row = [
    "onboarding-chorba",
    categoryNames.ar,
    categoryNames.fr,
    "شربة الدار",
    importedName,
    "",
    "شربة تجريبية",
    "Chorba fictive",
    "",
    "450",
  ];
  const csv = [menuImportColumns.join(","), row.join(",")].join("\r\n");
  await page.getByLabel(labels.fileLabel, { exact: true }).setInputFiles({
    name: "menu.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: labels.preview, exact: true }).click();
  await page.getByRole("button", { name: labels.apply, exact: true }).click();
  await expect(page.getByText(labels.applied, { exact: true })).toBeVisible();
}

async function expectCustomerPreview(
  page: Page,
  { itemPage, previewUrl, photoId }: { itemPage: string; previewUrl: string; photoId: string },
) {
  const response = await page.request.get(previewUrl);
  expect(response.status()).toBe(200);
  const { items } = menuPreviewPageOutput.parse(await response.json());
  expect(items).toHaveLength(11);
  expect(items.find(({ names }) => names.fr === signatureNames.fr)).toMatchObject({
    photoId,
    priceDzd: 660,
  });
  expect(items.find(({ names }) => names.fr === importedName)?.priceDzd).toBe(450);
  const changedPrices = items
    .filter(({ names }) => names.fr !== importedName)
    .map(({ priceDzd }) => priceDzd)
    .sort((left, right) => left - right);
  expect(changedPrices).toEqual([...Array<number>(9).fill(550), 660]);

  await page.goto(itemPage);
  const labels = fr.menuPreview;
  await page.getByRole("button", { name: labels.open, exact: true }).click();
  const preview = page.locator("#menu-preview");
  await expect(preview.getByText(importedName, { exact: true })).toBeVisible();
  const image = preview.locator(`img[src$="/${photoId}/variants/webp/320"]`);
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  await preview
    .getByRole("button", { name: labels.details.replace("{name}", signatureNames.fr) })
    .click();
  await expect(preview.getByText(optionName, { exact: true })).toBeVisible();
}

export async function completeOnboardingMenu(page: Page, origin: string, merchantId: string) {
  const root = `${origin}/v1/merchants/${merchantId}/menu`;
  const menuPage = `${origin}/fr/merchant/${merchantId}/menu`;
  const categoryId = await createMenuFixtures(page, root, menuPage);
  const itemPage = `${menuPage}/${categoryId}/items`;
  const photoId =
    await test.step("Build a ten-item menu with a cropped photo and reusable option", async () =>
      createSignatureDish(page, itemPage));
  await test.step("Preview and apply prices to the whole category", async () =>
    applyBulkPrices(page));
  await test.step("Import another item from CSV", async () => importChorba(page, menuPage));
  await test.step("Read the saved menu, photo, changed prices and options in customer preview", async () =>
    expectCustomerPreview(page, {
      itemPage,
      photoId,
      previewUrl: `${root}/preview/items?categoryId=${categoryId}`,
    }));
}
