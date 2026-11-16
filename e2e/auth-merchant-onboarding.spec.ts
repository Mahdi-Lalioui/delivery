import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { adminMerchantReviewOutput } from "../packages/contracts/src/admin.ts";
import { mediaOutput } from "../packages/contracts/src/media.ts";
import { merchantApplicationOutput } from "../packages/contracts/src/merchant.ts";
import { menuImportColumns } from "../packages/contracts/src/menu-import.ts";
import {
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
  menuOptionGroupWriteOutput,
} from "../packages/contracts/src/menu.ts";
import { bulkPricePreviewOutput } from "../packages/contracts/src/menu-price.ts";
import { formatDzd } from "../packages/i18n/src/formats.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness, withMediaWorker } from "./auth-fixture.ts";
import { enterAdminQueue, enterOtp, waitForPost } from "./auth-sign-in.ts";

type MediaWorker = Parameters<Parameters<typeof withMediaWorker>[1]>[0];

const restaurantName = "Maison fictive d’Alger";
const applicant = { input: "0550 00 03 01", phone: "+213550000301" };
const reviewer = { input: "0660 00 03 02", phone: "+213660000302" };
const category = { ar: "أطباق البيت", fr: "Plats de la maison" };
// Eight dishes written through the API, one with a photo in the browser, one from the CSV.
const apiDishes = [400, 500, 600, 700, 800, 900, 1_000, 1_100].map((priceDzd, index) => ({
  names: { ar: `طبق ${String(index + 1)}`, fr: `Plat fictif ${String(index + 1)}` },
  priceDzd,
}));
const photoDish = { ar: "شوربة فريك", fr: "Chorba de la maison", priceDzd: 450 };
const importedDish = { fr: "Bourek importé", priceDzd: 350 };

/** The applicant signs up in French and submits the restaurant application. */
async function applyAsRestaurant(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in?continue=merchant-apply");
  await enterOtp(page, auth, { account: applicant, labels: fr.auth });
  const commune = await auth.seedAlgiersCommune();
  await page.getByRole("link", { name: fr.auth.continueApplication }).click();
  await expect(page.getByRole("heading", { name: fr.merchant.applicationTitle })).toBeVisible();
  await page.getByRole("textbox", { name: fr.merchant.restaurantName }).fill(restaurantName);
  await page.getByRole("textbox", { name: fr.merchant.ownerName }).fill("Propriétaire fictif");
  await page
    .getByRole("combobox", { name: fr.merchant.commune })
    .selectOption({ label: commune.nameFr });
  await page.getByRole("checkbox", { name: fr.merchant.cuisineAlgerian }).check();
  await page
    .getByRole("textbox", { name: fr.merchant.latitude })
    .fill(String(commune.pin.latitude));
  await page
    .getByRole("textbox", { name: fr.merchant.longitude })
    .fill(String(commune.pin.longitude));
  const submitted = waitForPost(page, "/v1/merchant-applications");
  await page.getByRole("button", { name: fr.merchant.submit }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  await expect(page.getByRole("heading", { name: fr.merchant.submittedTitle })).toBeVisible();
  return merchantApplicationOutput.parse(await response.json()).merchantId;
}

/** The notified admin follows the SMS path and approves the application. */
async function approveFromNotice(
  page: Page,
  auth: AuthHarness,
  { merchantId, notice, totp }: { merchantId: string; notice: string; totp: () => string },
) {
  await enterAdminQueue(page, auth, { ...reviewer, totp });
  await page.goto(auth.origin + notice.slice(notice.lastIndexOf(" ") + 1));
  await page.getByRole("button", { name: restaurantName, exact: true }).click();
  const details = page.getByRole("region", { name: restaurantName });
  await details.getByRole("radio", { name: fr.adminMerchant.approve }).check();
  await details
    .getByLabel(fr.adminMerchant.reason, { exact: true })
    .fill("Commune et identité vérifiées pour cette demande fictive.");
  const review = waitForPost(page, `/v1/admin/merchant-applications/${merchantId}/review`);
  await details.getByRole("button", { name: fr.adminMerchant.confirm }).click();
  const approval = await review;
  expect(approval.status()).toBe(200);
  expect(adminMerchantReviewOutput.parse(await approval.json())).toMatchObject({
    merchantId,
    status: "approved",
  });
  await expect(page.getByText(fr.adminMerchant.approved, { exact: true })).toBeVisible();
}

function sameOrigin(origin: string, sessionId: string) {
  return {
    origin,
    "sec-fetch-site": "same-origin",
    "x-expected-session-id": sessionId,
    "idempotency-key": randomUUID(),
  };
}

/** Creates the category, a shared option group and eight dishes with the owner's session. */
async function seedMenuBase(page: Page, origin: string, merchantId: string) {
  const root = `${origin}/v1/merchants/${merchantId}/menu`;
  const menu = menuCategoryPageOutput.parse(
    await (await page.request.get(root + "/categories")).json(),
  );
  const headers = () => sameOrigin(origin, menu.sessionId);
  const created = await page.request.post(root + "/categories", {
    headers: headers(),
    data: { names: category, availability: null, expectedRevision: menu.revision },
  });
  expect(created.status()).toBe(201);
  const written = menuCategoryWriteOutput.parse(await created.json());
  const group = await page.request.post(root + "/option-groups", {
    headers: headers(),
    data: {
      names: { ar: "صلصات", fr: "Sauces" },
      minimum: 0,
      maximum: 1,
      options: [
        {
          names: { ar: "هريسة", fr: "Harissa" },
          priceDeltaDzd: 0,
          isDefault: false,
          isAvailable: true,
        },
      ],
      expectedRevision: written.revision,
    },
  });
  expect(group.status()).toBe(201);
  const options = menuOptionGroupWriteOutput.parse(await group.json());
  let expectedRevision = options.revision;
  for (const dish of apiDishes) {
    const response = await page.request.post(root + "/items", {
      headers: headers(),
      data: {
        ...dish,
        categoryId: written.category.categoryId,
        descriptions: { fr: "Plat fictif de démonstration" },
        photoId: null,
        tags: [],
        extraPrepMinutes: 0,
        optionGroupIds: [options.optionGroup.optionGroupId],
        expectedRevision,
      },
    });
    expect(response.status()).toBe(201);
    expectedRevision = menuItemWriteOutput.parse(await response.json()).revision;
  }
  return {
    categoryId: written.category.categoryId,
    optionGroupId: options.optionGroup.optionGroupId,
  };
}

/** Adds the ninth dish in the item editor with a keyboard-cropped photo. */
async function addPhotoDish(page: Page, worker: MediaWorker, merchantId: string) {
  await page.getByRole("button", { name: fr.menuItem.newItem, exact: true }).click();
  const editor = page.getByRole("region", { name: fr.menuItem.createTitle });
  await editor.getByLabel(fr.menuItem.nameAr, { exact: true }).fill(photoDish.ar);
  await editor.getByLabel(fr.menuItem.nameFr, { exact: true }).fill(photoDish.fr);
  await editor.getByLabel(fr.menuItem.descriptionFr, { exact: true }).fill("Soupe fictive");
  await editor.getByLabel(fr.menuItem.price, { exact: true }).fill(String(photoDish.priceDzd));
  const reservation = waitForPost(page, "/v1/media/uploads");
  await editor.getByLabel(fr.photoUpload.choose).setInputFiles({
    name: "chorba.jpg",
    mimeType: "image/jpeg",
    buffer: await worker.syntheticJpeg(),
  });
  const { mediaId } = mediaOutput.parse(await (await reservation).json());
  const cropper = page.getByRole("group", {
    name: fr.photoCrop.title,
    description: fr.photoCrop.instructions,
  });
  await expect(cropper).toBeVisible();
  await cropper.focus();
  await cropper.press("+");
  await page.getByRole("button", { name: fr.photoCrop.confirm, exact: true }).click();
  await expect(editor.getByText(fr.photoUpload.ready, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const saved = waitForPost(page, `/v1/merchants/${merchantId}/menu/items`);
  await page.getByRole("button", { name: fr.menuItem.save, exact: true }).click();
  return { mediaId, saved };
}

/** Raises every dish in the category by 10 %, rounded to 10 DA, through the bulk price panel. */
async function raisePrices(page: Page, merchantId: string) {
  const panel = page.getByRole("region", { name: fr.menuPrice.title });
  await panel.getByRole("checkbox", { name: fr.menuPrice.selectAll, exact: true }).check();
  await panel.getByLabel(fr.menuPrice.amountLabel, { exact: true }).fill("10");
  const pricesPath = `/v1/merchants/${merchantId}/menu/prices`;
  const read = waitForPost(page, pricesPath + "/preview");
  await panel.getByRole("button", { name: fr.menuPrice.preview, exact: true }).click();
  const preview = bulkPricePreviewOutput.parse(await (await read).json());
  const apply = waitForPost(page, pricesPath + "/apply");
  await panel.getByRole("button", { name: fr.menuPrice.apply, exact: true }).click();
  expect((await apply).status()).toBe(201);
  await expect(panel.getByRole("status")).toHaveText(fr.menuPrice.applied);
  return preview.items.map(({ newPriceDzd }) => newPriceDzd);
}

/** Imports the tenth dish from a CSV file into the same category. */
async function importDish(page: Page) {
  await page.getByRole("button", { name: fr.menuItem.importMenu, exact: true }).click();
  const csv = [
    menuImportColumns.join(","),
    `onboarding-010,${category.ar},${category.fr},,${importedDish.fr},,,Feuilleté fictif,,${String(importedDish.priceDzd)}`,
  ].join("\r\n");
  await page.getByLabel(fr.menuImport.fileLabel, { exact: true }).setInputFiles({
    name: "menu.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: fr.menuImport.preview, exact: true }).click();
  const apply = page.getByRole("button", { name: fr.menuImport.apply, exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByText(fr.menuImport.applied, { exact: true })).toBeVisible();
}

test("[MER-01:onboarding] a restaurant signs up, is approved and publishes a ten-dish menu @merchant-onboarding", async ({
  baseURL,
  browser,
  ignoreHTTPSErrors,
  page,
}) => {
  test.setTimeout(180_000);
  await withAuthHarness(baseURL, async (auth) => {
    await withMediaWorker(auth, async (worker) => {
      // The admin exists before the signup, so the review notice has a recipient.
      const totp = await auth.seedAdmin(reviewer.phone);
      const merchantId = await applyAsRestaurant(page, auth);

      await test.step("The admin approves from the review SMS", async () => {
        await expect.poll(() => worker.readSms().length, { timeout: 15_000 }).toBe(1);
        const adminContext = await browser.newContext({ ignoreHTTPSErrors });
        try {
          const notice = worker.readSms()[0]?.text ?? "";
          await approveFromNotice(await adminContext.newPage(), auth, { merchantId, notice, totp });
        } finally {
          await adminContext.close();
        }
      });

      const { categoryId, optionGroupId } = await seedMenuBase(page, auth.origin, merchantId);
      await page.goto(`${auth.origin}/fr/merchant/${merchantId}/menu/${categoryId}/items`);
      const { mediaId, saved } = await addPhotoDish(page, worker, merchantId);
      expect((await saved).status()).toBe(201);

      const raised = await test.step("Raise every price by 10 %", () =>
        raisePrices(page, merchantId));
      expect(raised).toEqual([440, 550, 660, 770, 880, 990, 1_100, 1_210, 500]);
      await importDish(page);

      await test.step("Read the ten dishes back with their options and photo", async () => {
        const list = await page.request.get(
          `${auth.origin}/v1/merchants/${merchantId}/menu/items?categoryId=${categoryId}&limit=50`,
        );
        const { items } = menuItemPageOutput.parse(await list.json());
        expect(items).toHaveLength(10);
        const withOptions = items.filter((item) => item.optionGroupIds.includes(optionGroupId));
        expect(withOptions).toHaveLength(apiDishes.length);
        expect(items.find(({ names }) => names.fr === photoDish.fr)?.photoId).toBe(mediaId);
      });

      await test.step("See every dish at its new price in the customer preview", async () => {
        await page.goto(`${auth.origin}/fr/merchant/${merchantId}/menu/preview`);
        const preview = page.getByRole("region", { name: fr.menuPreview.categories });
        const expected = [
          ...apiDishes.map(({ names }, index) => [names.fr, raised[index] ?? 0] as const),
          [photoDish.fr, 500] as const,
          [importedDish.fr, importedDish.priceDzd] as const,
        ];
        for (const [name, priceDzd] of expected) {
          const dish = preview.getByRole("listitem").filter({
            has: page.getByRole("heading", { name, exact: true }),
          });
          await expect(dish.getByText(formatDzd(priceDzd, "fr"), { exact: true })).toBeVisible();
        }
        const photo = preview
          .getByRole("listitem")
          .filter({ has: page.getByRole("heading", { name: photoDish.fr, exact: true }) })
          .locator("picture img");
        await photo.scrollIntoViewIfNeeded();
        await expect(photo).toHaveJSProperty("complete", true);
        const source = await photo.evaluate((image: HTMLImageElement) => image.currentSrc);
        expect(new URL(source).pathname).toMatch(new RegExp(`^/media/${mediaId}/`));
      });
    });
  });
});
