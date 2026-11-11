import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { menuImportColumns } from "../packages/contracts/src/menu-import.ts";
import { menuCategoryPageOutput, menuItemPageOutput } from "../packages/contracts/src/menu.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";

test("[MER-12] previews a file, applies once and reimports without duplicates @menu-import", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const phone = "+213550000291";
    await page.goto(auth.origin + "/fr/sign-in");
    await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 91");
    await page.getByRole("button", { name: fr.auth.sendCode }).click();
    const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
    await expect(otp).toBeFocused();
    await otp.fill(auth.latestSms(phone));
    await otp.press("Enter");
    await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
    const memberships = await auth.seedMenuMemberships(phone);
    const merchant = memberships.find(({ role }) => role === "owner");
    if (!merchant) throw new Error("Expected an owner fixture.");
    const root = `${auth.origin}/v1/merchants/${merchant.merchantId}/menu`;
    const listed = menuCategoryPageOutput.parse(
      await (await page.request.get(root + "/categories")).json(),
    );
    expect(listed.categories).toEqual([]);
    await page.goto(`${auth.origin}/fr/merchant/${merchant.merchantId}/menu`);
    await page.getByRole("button", { name: "Importer un menu", exact: true }).click();
    const [template] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: fr.menuImport.downloadTemplate }).click(),
    ]);
    expect(template.suggestedFilename()).toBe("zaafran-menu-template.csv");
    expect(await readFile(await template.path(), "utf8")).toBe(
      "\uFEFF" + menuImportColumns.join(",") + "\r\n",
    );
    const file = page.getByLabel(fr.menuImport.fileLabel, { exact: true });
    const csv = [
      menuImportColumns.join(","),
      "import-001,,Plats fictifs,,Chorba fictive,,,Description fictive,,450",
    ].join("\r\n");
    const preview = page.getByRole("button", { name: fr.menuImport.preview, exact: true });
    const apply = page.getByRole("button", { name: fr.menuImport.apply, exact: true });
    await file.setInputFiles({
      name: "menu.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv.replace(/450$/u, "450.5")),
    });
    await preview.click();
    const errors = page.getByRole("table", { name: fr.menuImport.errorsCaption });
    await expect(errors.getByText(fr.menuImport.fields.price_dzd)).toBeVisible();
    await expect(errors.getByText(fr.menuImport.reasons.invalid_price)).toBeVisible();
    await expect(apply).toBeDisabled();
    await file.setInputFiles({ name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(preview).toBeEnabled();
    await preview.click();
    await expect(apply).toBeEnabled();
    const applyKeys: string[] = [];
    await page.route(`${root}/import/apply`, async (route) => {
      const key = route.request().headers()["idempotency-key"];
      if (!key) throw new Error("Expected an idempotency key on apply.");
      applyKeys.push(key);
      await route.continue();
    });
    await page.route(
      (url) => url.pathname === new URL(`${root}/categories`).pathname,
      async (route) => {
        await route.abort("failed");
      },
      { times: 1 },
    );
    await apply.click();
    await expect(page.getByText(fr.menuImport.failureError, { exact: true })).toBeVisible();
    await expect(apply).toBeEnabled();
    await expect(preview).toBeDisabled();
    await apply.click();
    await expect(page.getByText(fr.menuImport.applied, { exact: true })).toBeVisible();
    expect(applyKeys).toHaveLength(2);
    expect(applyKeys[1]).toBe(applyKeys[0]);
    await expect(page.getByRole("heading", { name: "Plats fictifs", exact: true })).toBeVisible();
    const imported = menuCategoryPageOutput.parse(
      await (await page.request.get(root + "/categories")).json(),
    );
    expect(imported.categories).toHaveLength(1);
    const [category] = imported.categories;
    if (!category) throw new Error("Expected the imported category.");
    const readItems = async () =>
      menuItemPageOutput.parse(
        await (await page.request.get(`${root}/items?categoryId=${category.categoryId}`)).json(),
      );
    const first = await readItems();
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ names: { fr: "Chorba fictive" }, priceDzd: 450 });
    await page.getByRole("button", { name: fr.menuImport.newImport, exact: true }).click();
    await file.setInputFiles({ name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await preview.click();
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.getByText(fr.menuImport.applied, { exact: true })).toBeVisible();
    expect((await readItems()).items).toEqual(first.items);
    await page.goto(
      `${auth.origin}/fr/merchant/${merchant.merchantId}/menu/${category.categoryId}/items`,
    );
    await expect(page.getByRole("heading", { name: "Chorba fictive", exact: true })).toBeVisible();
  });
});
