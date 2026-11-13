import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { menuImportColumns } from "../packages/contracts/src/menu-import.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemPageOutput,
} from "../packages/contracts/src/menu.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";

test("[MER-12:browser] previews a file, applies once and reimports without duplicates @menu-import", async ({
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
    const created = await page.request.post(root + "/categories", {
      headers: {
        origin: auth.origin,
        "sec-fetch-site": "same-origin",
        "x-expected-session-id": listed.sessionId,
        "idempotency-key": randomUUID(),
      },
      data: {
        names: { fr: "Plats fictifs" },
        availability: null,
        expectedRevision: listed.revision,
      },
    });
    expect(created.status()).toBe(201);
    const { category } = menuCategoryWriteOutput.parse(await created.json());
    await page.goto(
      `${auth.origin}/fr/merchant/${merchant.merchantId}/menu/${category.categoryId}/items`,
    );
    await page.getByRole("button", { name: fr.menuItem.importMenu, exact: true }).click();
    const file = page.getByLabel(fr.menuImport.fileLabel, { exact: true });
    const csv = [
      menuImportColumns.join(","),
      "import-001,,Plats fictifs,,Chorba fictive,,,Description fictive,,450",
    ].join("\r\n");
    await file.setInputFiles({ name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const preview = page.getByRole("button", { name: fr.menuImport.preview, exact: true });
    await expect(preview).toBeEnabled();
    await preview.click();
    const apply = page.getByRole("button", { name: fr.menuImport.apply, exact: true });
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.getByText(fr.menuImport.applied, { exact: true })).toBeVisible();
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
  });
});
