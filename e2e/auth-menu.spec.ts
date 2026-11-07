import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { problemResponseSchema } from "../packages/contracts/src/health.ts";
import {
  menuCategoryOrderOutput,
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
} from "../packages/contracts/src/menu.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";

const phone = "+213550000221";
const menu = fr.menuCategory;
const starters = {
  names: { ar: "المقبلات", fr: "Entrées du soir" },
  availability: { from: "18:00", to: "02:00" },
};
const desserts = { names: { ar: "الحلويات", fr: "Desserts maison" }, availability: null };
const renamed = { ...starters, names: { ...starters.names, fr: "Entrées de nuit" } };
type CategoryDraft = typeof starters | typeof desserts;

async function signIn(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 21");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
}

function categoryPath(merchantId: string) {
  return `/v1/merchants/${merchantId}/menu/categories`;
}

async function openManagerMenu(page: Page, auth: AuthHarness) {
  const fixtures = await auth.seedMenuMemberships(phone);
  await page.goto(auth.origin + "/fr/merchant");
  for (const fixture of fixtures) {
    const membership = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: fixture.restaurantName, exact: true }),
    });
    await expect(membership).toBeVisible();
    const link = membership.getByRole("link", { name: fr.merchant.manageMenu });
    if (fixture.role === "staff") await expect(link).toHaveCount(0);
    else await expect(link).toHaveAttribute("href", `/fr/merchant/${fixture.merchantId}/menu`);
  }
  const manager = fixtures.find(({ role }) => role === "manager");
  const staff = fixtures.find(({ role }) => role === "staff");
  if (!manager || !staff) throw new Error("The category journey needs manager and staff fixtures.");
  const menuPath = `/fr/merchant/${manager.merchantId}/menu`;
  await page
    .getByRole("link", { name: fr.merchant.manageMenu })
    .and(page.locator(`a[href="${menuPath}"]`))
    .click();
  await expect(page).toHaveURL(auth.origin + menuPath);
  await expect(page.getByRole("heading", { name: menu.title })).toBeVisible();
  return {
    endpoint: categoryPath(manager.merchantId),
    staffEndpoint: categoryPath(staff.merchantId),
  };
}

function waitForWrite(page: Page, method: "POST" | "PUT", path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method && new URL(response.url()).pathname === path,
  );
}

async function fillCategory(page: Page, draft: CategoryDraft) {
  await page.getByLabel(menu.nameAr, { exact: true }).fill(draft.names.ar);
  await page.getByLabel(menu.nameFr, { exact: true }).fill(draft.names.fr);
  await page.getByLabel(menu.from, { exact: true }).fill(draft.availability?.from ?? "");
  await page.getByLabel(menu.to, { exact: true }).fill(draft.availability?.to ?? "");
}

function categoryRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
}

async function createCategory(page: Page, endpoint: string, draft: CategoryDraft) {
  await page.getByRole("button", { name: menu.newCategory }).click();
  await fillCategory(page, draft);
  const write = waitForWrite(page, "POST", endpoint);
  await page.getByRole("button", { name: menu.save }).click();
  const response = await write;
  expect(response.status()).toBe(201);
  const { category } = menuCategoryWriteOutput.parse(await response.json());
  expect(category).toMatchObject(draft);
  await expect(categoryRow(page, draft.names.fr)).toBeFocused();
  return category.categoryId;
}

async function renameCategory(page: Page, endpoint: string, categoryId: string) {
  await categoryRow(page, starters.names.fr)
    .getByRole("button", { name: /^Modifier/ })
    .click();
  await page.getByLabel(menu.nameFr, { exact: true }).fill(renamed.names.fr);
  const write = waitForWrite(page, "PUT", `${endpoint}/${categoryId}`);
  await page.getByRole("button", { name: menu.save }).click();
  const response = await write;
  expect(response.status()).toBe(200);
  expect(menuCategoryWriteOutput.parse(await response.json()).category).toMatchObject({
    ...renamed,
    categoryId,
  });
  await expect(categoryRow(page, renamed.names.fr)).toBeFocused();
}

async function expectPersistedOrder(
  page: Page,
  endpoint: string,
  expected: {
    readonly ids: readonly string[];
    readonly names: readonly string[];
    readonly revision: number;
  },
) {
  await page.reload();
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(expected.names.length);
  for (const [index, name] of expected.names.entries()) {
    await expect(rows.nth(index).getByText(name, { exact: true })).toBeVisible();
  }
  const response = await page.request.get(new URL(endpoint, page.url()).href);
  expect(response.status()).toBe(200);
  const persisted = menuCategoryPageOutput.parse(await response.json());
  expect(persisted.revision).toBe(expected.revision);
  expect(persisted.categories.map(({ categoryId }) => categoryId)).toEqual(expected.ids);
}

async function dragCategory(page: Page, names: { from: string; to: string }) {
  const handle = categoryRow(page, names.from).locator(".menu-category-grip");
  const target = categoryRow(page, names.to);
  await handle.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("The category pointer handle and target must both be visible.");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

async function reorderCategories(page: Page, endpoint: string, ids: readonly [string, string]) {
  const moveUp = categoryRow(page, desserts.names.fr).getByRole("button", { name: /^Monter/ });
  const keyboardWrite = waitForWrite(page, "PUT", endpoint + "/order");
  await moveUp.focus();
  await moveUp.press("Enter");
  const keyboard = await keyboardWrite;
  expect(keyboard.status()).toBe(200);
  const swapped = menuCategoryOrderOutput.parse(await keyboard.json());
  expect(swapped.categoryIds).toEqual([ids[1], ids[0]]);
  await expect(categoryRow(page, desserts.names.fr)).toBeFocused();
  await expect(page.getByRole("status")).toContainText("à la position 1 sur 2.");
  await expectPersistedOrder(page, endpoint, {
    ids: swapped.categoryIds,
    names: [desserts.names.fr, renamed.names.fr],
    revision: swapped.revision,
  });

  const pointerWrite = waitForWrite(page, "PUT", endpoint + "/order");
  await dragCategory(page, { from: renamed.names.fr, to: desserts.names.fr });
  const pointer = await pointerWrite;
  expect(pointer.status()).toBe(200);
  const restored = menuCategoryOrderOutput.parse(await pointer.json());
  expect(restored.categoryIds).toEqual(ids);
  expect(restored.revision).toBe(swapped.revision + 1);
  await expect(categoryRow(page, renamed.names.fr)).toBeFocused();
  await expectPersistedOrder(page, endpoint, {
    ids: restored.categoryIds,
    names: [renamed.names.fr, desserts.names.fr],
    revision: restored.revision,
  });
}

test("[MER-09:browser] [AUTH-07:browser] edits and reorders categories for an authorized merchant @menu-categories", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    await signIn(page, auth);
    const { endpoint, staffEndpoint } = await openManagerMenu(page, auth);
    const first = await createCategory(page, endpoint, starters);
    await expect(categoryRow(page, starters.names.fr).getByText("le lendemain")).toBeVisible();
    const second = await createCategory(page, endpoint, desserts);
    await renameCategory(page, endpoint, first);
    await reorderCategories(page, endpoint, [first, second]);
    const forbidden = await page.request.get(auth.origin + staffEndpoint);
    expect(forbidden.status()).toBe(404);
    expect(problemResponseSchema.parse(await forbidden.json()).code).toBe("not_found");
  });
});
