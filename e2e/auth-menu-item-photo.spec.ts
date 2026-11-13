import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { mediaCropInput, mediaOutput } from "../packages/contracts/src/media.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
} from "../packages/contracts/src/menu.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness, withMediaWorker } from "./auth-fixture.ts";

const owner = { input: "0550 00 02 91", phone: "+213550000291" };
const categoryNames = { ar: "أطباق", fr: "Plats du jour" };
const itemNames = { ar: "شوربة فريك", fr: "Chorba frik" };

async function signInOwner(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill(owner.input);
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(owner.phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const memberships = await auth.seedMenuMemberships(owner.phone);
  const merchantId = memberships.find(({ role }) => role === "owner")?.merchantId;
  if (!merchantId) throw new Error("The photo journey needs an approved owner fixture.");
  return merchantId;
}

async function createCategory(page: Page, origin: string, merchantId: string) {
  const endpoint = `${origin}/v1/merchants/${merchantId}/menu/categories`;
  const menu = menuCategoryPageOutput.parse(await (await page.request.get(endpoint)).json());
  const response = await page.request.post(endpoint, {
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "x-expected-session-id": menu.sessionId,
      "idempotency-key": randomUUID(),
    },
    data: { names: categoryNames, availability: null, expectedRevision: menu.revision },
  });
  expect(response.status()).toBe(201);
  return menuCategoryWriteOutput.parse(await response.json()).category.categoryId;
}

async function cropWithKeyboard(page: Page, mediaId: string) {
  const cropper = page.getByRole("group", {
    name: fr.photoCrop.title,
    description: fr.photoCrop.instructions,
  });
  await expect(cropper).toBeVisible();
  await expect(page.getByRole("img", { name: fr.photoCrop.previewAlt })).toHaveJSProperty(
    "complete",
    true,
  );
  await cropper.focus();
  await cropper.press("Shift+ArrowRight");
  await cropper.press("ArrowDown");
  await cropper.press("+");
  const cropWrite = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/v1/media/${mediaId}/crop`,
  );
  await page.getByRole("button", { name: fr.photoCrop.confirm, exact: true }).click();
  const response = await cropWrite;
  expect(response.ok()).toBe(true);
  const crop = mediaCropInput.parse(response.request().postDataJSON());
  expect(crop.focalX).toBeGreaterThan(5_000);
  expect(crop.focalY).toBeGreaterThan(5_000);
  expect(crop.zoomPercent).toBeGreaterThan(100);
}

test("[MER-14:browser] an owner uploads, crops by keyboard and saves an item photo @menu-photos", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    await withMediaWorker(auth, async ({ syntheticJpeg }) => {
      const merchantId = await signInOwner(page, auth);
      const categoryId = await createCategory(page, auth.origin, merchantId);
      await page.goto(`${auth.origin}/fr/merchant/${merchantId}/menu/${categoryId}/items`);
      await page.getByRole("button", { name: fr.menuItem.newItem, exact: true }).click();
      const editor = page.getByRole("region", { name: fr.menuItem.createTitle });
      await editor.getByLabel(fr.menuItem.nameAr, { exact: true }).fill(itemNames.ar);
      await editor.getByLabel(fr.menuItem.nameFr, { exact: true }).fill(itemNames.fr);
      await editor
        .getByLabel(fr.menuItem.descriptionFr, { exact: true })
        .fill("Soupe fictive de démonstration");
      await editor.getByLabel(fr.menuItem.price, { exact: true }).fill("450");

      const reservation = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/v1/media/uploads",
      );
      await editor.getByLabel(fr.photoUpload.choose).setInputFiles({
        name: "chorba.jpg",
        mimeType: "image/jpeg",
        buffer: await syntheticJpeg(),
      });
      const { mediaId } = mediaOutput.parse(await (await reservation).json());

      await test.step("Move the focal point and zoom with the keyboard", async () => {
        await cropWithKeyboard(page, mediaId);
        await expect(editor.getByText(fr.photoUpload.ready, { exact: true })).toBeVisible({
          timeout: 30_000,
        });
      });

      const itemsPath = `/v1/merchants/${merchantId}/menu/items`;
      const created = await test.step("Save the item with its photo", async () => {
        const write = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === itemsPath,
        );
        await page.getByRole("button", { name: fr.menuItem.save, exact: true }).click();
        const response = await write;
        expect(response.status()).toBe(201);
        const created = menuItemWriteOutput.parse(await response.json());
        expect(created.item.photoId).toBe(mediaId);
        return created;
      });

      await test.step("Reopen the saved item and read its photo back", async () => {
        const list = await page.request.get(
          `${auth.origin}${itemsPath}?categoryId=${categoryId}&limit=50`,
        );
        expect(list.status()).toBe(200);
        const saved = menuItemPageOutput
          .parse(await list.json())
          .items.find(({ itemId }) => itemId === created.item.itemId);
        expect(saved?.photoId).toBe(mediaId);
        await page.reload();
        const edit = fr.menuItem.editLabel.replace("{name}", itemNames.fr);
        await page.getByRole("button", { name: edit, exact: true }).click();
        await expect(page.getByText(fr.menuItem.photoAttached, { exact: true })).toBeVisible();
      });
    });
  });
});
