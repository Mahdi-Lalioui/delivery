import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
  menuOptionGroupDetailOutput,
  menuOptionGroupWriteOutput,
} from "../packages/contracts/src/menu.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";

const phone = "+213550000251";
const groupLabels = fr.menuOptionGroup;
const itemLabels = fr.menuItem;
const categoryNames = { ar: "أطباق تجريبية", fr: "Plats du jardin" };
const itemNames = [
  { ar: "كسكس", fr: "Couscous" },
  { ar: "شربة", fr: "Chorba" },
];
const olives = {
  names: { ar: "زيتون", fr: "Olives" },
  priceDeltaDzd: 25,
  isDefault: true,
  isAvailable: false,
};
const harissa = {
  names: { ar: "هريسة", fr: "Harissa" },
  priceDeltaDzd: 0,
  isDefault: false,
  isAvailable: true,
};
const sauces = {
  names: { ar: "صلصات", fr: "Sauces" },
  minimum: 1,
  maximum: 2,
  options: [olives, harissa],
};
const extras = {
  names: { ar: "إضافات", fr: "Suppléments" },
  minimum: 0,
  maximum: 1,
  options: [
    { names: { ar: "خبز", fr: "Pain" }, priceDeltaDzd: 10, isDefault: false, isAvailable: true },
  ],
};
const revisedNames = { ar: "صلصات البيت", fr: "Sauces maison" };

type GroupDraft = typeof sauces;
type Group = ReturnType<typeof menuOptionGroupWriteOutput.parse>["optionGroup"] & {
  names: GroupDraft["names"];
};

function named(template: string, name: string) {
  return template.replace("{name}", name);
}

async function signInOwner(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 51");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const memberships = await auth.seedMenuMemberships(phone);
  const owner = memberships.find(({ role }) => role === "owner");
  if (!owner) throw new Error("The option journey requires an approved owner fixture.");
  return owner.merchantId;
}

async function seedItems(page: Page, origin: string, merchantId: string) {
  const root = `/v1/merchants/${merchantId}/menu`;
  const categoryEndpoint = origin + root + "/categories";
  const response = await page.request.get(categoryEndpoint);
  expect(response.status()).toBe(200);
  const { revision, sessionId } = menuCategoryPageOutput.parse(await response.json());
  const headers = { origin, "sec-fetch-site": "same-origin", "x-expected-session-id": sessionId };
  const categoryResponse = await page.request.post(categoryEndpoint, {
    headers: { ...headers, "idempotency-key": randomUUID() },
    data: { names: categoryNames, availability: null, expectedRevision: revision },
  });
  expect(categoryResponse.status()).toBe(201);
  const category = menuCategoryWriteOutput.parse(await categoryResponse.json());
  const categoryId = category.category.categoryId;
  let expectedRevision = category.revision;
  for (const names of itemNames) {
    const item = await page.request.post(origin + root + "/items", {
      headers: { ...headers, "idempotency-key": randomUUID() },
      data: {
        categoryId,
        expectedRevision,
        names,
        descriptions: { fr: "Plat de test" },
        priceDzd: 600,
        photoId: null,
        tags: [],
        extraPrepMinutes: 0,
        optionGroupIds: [],
      },
    });
    expect(item.status()).toBe(201);
    expectedRevision = menuItemWriteOutput.parse(await item.json()).revision;
  }
  return { root, categoryId };
}

function observeWrite(page: Page, method: "POST" | "PUT", path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method && new URL(response.url()).pathname === path,
  );
}

function optionRow(editor: Locator, position: number) {
  return editor
    .getByRole("list", { name: groupLabels.options })
    .getByRole("listitem")
    .nth(position - 1);
}

async function fillOption(row: Locator, option: GroupDraft["options"][number]) {
  await row.getByLabel(groupLabels.nameAr, { exact: true }).fill(option.names.ar);
  await row.getByLabel(groupLabels.nameFr, { exact: true }).fill(option.names.fr);
  await row
    .getByLabel(groupLabels.priceDelta, { exact: true })
    .fill(option.priceDeltaDzd === 25 ? "٢٥" : String(option.priceDeltaDzd));
  await row.getByRole("checkbox", { name: groupLabels.defaultChoice }).setChecked(option.isDefault);
  await row.getByRole("checkbox", { name: groupLabels.available }).setChecked(option.isAvailable);
}

async function createGroup(page: Page, path: string, draft: GroupDraft) {
  await page.getByRole("button", { name: groupLabels.newGroup }).click();
  const editor = page.getByRole("region", { name: groupLabels.createTitle });
  const names = editor.getByRole("group", { name: groupLabels.names, exact: true });
  await names.getByLabel(groupLabels.nameAr, { exact: true }).fill(draft.names.ar);
  await names.getByLabel(groupLabels.nameFr, { exact: true }).fill(draft.names.fr);
  await editor.getByLabel(groupLabels.minimum, { exact: true }).fill(String(draft.minimum));
  await editor.getByLabel(groupLabels.maximum, { exact: true }).fill(String(draft.maximum));
  for (const [index, option] of draft.options.entries()) {
    if (index > 0) await editor.getByRole("button", { name: groupLabels.addOption }).click();
    await fillOption(optionRow(editor, index + 1), option);
  }
  const write = observeWrite(page, "POST", path);
  await editor.getByRole("button", { name: groupLabels.save, exact: true }).click();
  const response = await write;
  expect(response.status()).toBe(201);
  const { optionGroup } = menuOptionGroupWriteOutput.parse(await response.json());
  expect(optionGroup).toMatchObject(draft);
  await expect(editor).toHaveCount(0);
  return { ...optionGroup, names: draft.names };
}

async function editSharedGroup(page: Page, path: string, shared: Group) {
  await page.getByRole("button", { name: named(groupLabels.editLabel, sauces.names.fr) }).click();
  const editor = page.getByRole("region", { name: groupLabels.editTitle });
  const names = editor.getByRole("group", { name: groupLabels.names, exact: true });
  await names.getByLabel(groupLabels.nameAr, { exact: true }).fill(revisedNames.ar);
  await names.getByLabel(groupLabels.nameFr, { exact: true }).fill(revisedNames.fr);
  await optionRow(editor, 2)
    .getByRole("button", { name: groupLabels.moveEarlier.replace("{position}", "2") })
    .press("Enter");
  await expect(optionRow(editor, 1).getByLabel(groupLabels.nameFr)).toHaveValue(harissa.names.fr);
  await optionRow(editor, 1).getByLabel(groupLabels.priceDelta).fill("35");

  const detailPath = `${path}/${shared.optionGroupId}`;
  const write = observeWrite(page, "PUT", detailPath);
  await editor.getByRole("button", { name: groupLabels.save, exact: true }).click();
  const response = await write;
  expect(response.status()).toBe(200);
  const detail = await page.request.get(new URL(detailPath, page.url()).href);
  expect(detail.status()).toBe(200);
  const [first, second] = shared.options;
  if (!first || !second) throw new Error("Both saved options must have IDs.");
  expect(menuOptionGroupDetailOutput.parse(await detail.json()).optionGroup).toEqual({
    ...shared,
    names: revisedNames,
    options: [{ ...second, priceDeltaDzd: 35 }, first],
  });
}

async function openItemEditor(page: Page, name: string) {
  await page.getByRole("button", { name: named(itemLabels.editLabel, name), exact: true }).click();
  return page.getByRole("region", { name: itemLabels.editTitle });
}

async function attachGroup(editor: Locator, group: Group) {
  const picker = editor.getByRole("combobox", { name: itemLabels.optionGroupsAvailable });
  await expect(picker).toBeVisible();
  expect((await picker.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await picker.selectOption({ label: group.names.fr });
  await editor.getByRole("button", { name: itemLabels.optionGroupsAdd }).click();
}

function attachedRows(editor: Locator) {
  return editor.getByRole("list", { name: itemLabels.optionGroupsSelected }).getByRole("listitem");
}

async function expectAttachmentOrder(editor: Locator, names: string[]) {
  const rows = attachedRows(editor);
  await expect(rows).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(rows.nth(index).getByText(name, { exact: true })).toBeVisible();
  }
}

async function attachToItem({
  page,
  path,
  itemName,
  groups,
}: {
  page: Page;
  path: string;
  itemName: string;
  groups: Group[];
}) {
  const editor = await openItemEditor(page, itemName);
  for (const group of groups) await attachGroup(editor, group);
  const first = groups[0];
  const second = groups[1];
  if (second) {
    await editor
      .getByRole("button", { name: named(itemLabels.optionGroupsEarlier, second.names.fr) })
      .press("Enter");
    await expect(attachedRows(editor).first()).toBeFocused();
  }
  const ordered = second && first ? [second, first] : groups;
  await expectAttachmentOrder(
    editor,
    ordered.map(({ names }) => names.fr),
  );

  const itemPage = await page.request.get(new URL(path, page.url()).href);
  expect(itemPage.status()).toBe(200);
  const item = menuItemPageOutput
    .parse(await itemPage.json())
    .items.find(({ names }) => names.fr === itemName);
  if (!item) throw new Error("Expected the item to exist before attaching its groups.");
  const write = observeWrite(page, "PUT", `${new URL(path, page.url()).pathname}/${item.itemId}`);
  await editor.getByRole("button", { name: itemLabels.save, exact: true }).click();
  const response = await write;
  expect(response.status()).toBe(200);
  expect(menuItemWriteOutput.parse(await response.json()).item.optionGroupIds).toEqual(
    ordered.map(({ optionGroupId }) => optionGroupId),
  );
  await expect(editor).toHaveCount(0);
}

async function editPriceInline(page: Page, path: string, itemName: string) {
  const itemPage = await page.request.get(new URL(path, page.url()).href);
  expect(itemPage.status()).toBe(200);
  const item = menuItemPageOutput
    .parse(await itemPage.json())
    .items.find(({ names }) => names.fr === itemName);
  if (!item) throw new Error("Expected a saved item with options before editing its price.");

  const row = page.locator(`#menu-item-row-${item.itemId}`);
  const edit = row.getByRole("button", { name: named(itemLabels.editPriceLabel, itemName) });
  const input = row.getByRole("textbox", { name: named(itemLabels.inlinePriceLabel, itemName) });
  await expect(edit).toBeVisible();
  await edit.press("Enter");
  await expect(input).toBeFocused();
  await input.fill("601");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(edit).toBeFocused();

  await edit.press("Enter");
  await expect(input).toHaveValue(String(item.priceDzd));
  await input.fill("601.5");
  await input.press("Enter");
  await expect(row.getByText(itemLabels.invalidPrice)).toBeVisible();
  await input.fill("612");
  const write = observeWrite(page, "PUT", `${new URL(path, page.url()).pathname}/${item.itemId}`);
  await input.press("Enter");
  const response = await write;
  expect(response.status()).toBe(200);
  expect(menuItemWriteOutput.parse(await response.json()).item).toEqual({ ...item, priceDzd: 612 });
  await expect(edit).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: itemLabels.priceUpdated })).toBeVisible();
}

test("[MER-10] reuses a bilingual option group on two menu items @menu-option-groups", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const merchantId = await signInOwner(page, auth);
    const { root, categoryId } = await seedItems(page, auth.origin, merchantId);
    const menu = `${auth.origin}/fr/merchant/${merchantId}/menu`;
    const libraryPath = root + "/option-groups";
    const itemPath = root + "/items?categoryId=" + categoryId;
    await page.goto(menu);
    const library = page.getByRole("link", { name: fr.menuCategory.optionLibrary });
    await expect(library).toBeVisible();
    await library.click();
    const shared = await createGroup(page, libraryPath, sauces);
    const supplemental = await createGroup(page, libraryPath, extras);

    await page.getByRole("link", { name: groupLabels.backToMenu }).click();
    await page
      .getByRole("link", { name: named(fr.menuCategory.manageItemsLabel, categoryNames.fr) })
      .click();
    const itemPage = `${menu}/${categoryId}/items`;
    await expect(page).toHaveURL(itemPage);
    await attachToItem({
      page,
      path: itemPath,
      itemName: "Couscous",
      groups: [supplemental, shared],
    });
    await attachToItem({ page, path: itemPath, itemName: "Chorba", groups: [shared] });
    await editPriceInline(page, itemPath, "Couscous");

    await page.getByRole("link", { name: itemLabels.backToCategories }).click();
    await page.getByRole("link", { name: fr.menuCategory.optionLibrary }).click();
    await editSharedGroup(page, libraryPath, shared);

    await page.goto(itemPage);
    const firstEditor = await openItemEditor(page, "Couscous");
    await expectAttachmentOrder(firstEditor, [revisedNames.fr, extras.names.fr]);
    await firstEditor.getByRole("button", { name: itemLabels.cancel, exact: true }).click();
    const secondEditor = await openItemEditor(page, "Chorba");
    await expectAttachmentOrder(secondEditor, [revisedNames.fr]);

    const response = await page.request.get(new URL(itemPath, page.url()).href);
    expect(response.status()).toBe(200);
    const { items } = menuItemPageOutput.parse(await response.json());
    expect(
      items.map(({ names, priceDzd, optionGroupIds }) => ({
        name: names.fr,
        priceDzd,
        optionGroupIds,
      })),
    ).toEqual([
      {
        name: "Couscous",
        priceDzd: 612,
        optionGroupIds: [shared.optionGroupId, supplemental.optionGroupId],
      },
      { name: "Chorba", priceDzd: 600, optionGroupIds: [shared.optionGroupId] },
    ]);
  });
});
