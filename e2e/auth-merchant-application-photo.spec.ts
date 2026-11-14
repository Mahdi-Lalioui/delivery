import { expect, test, type Page } from "@playwright/test";
import { mediaOutput } from "../packages/contracts/src/media.ts";
import {
  merchantApplicationOutput,
  merchantMembershipsOutput,
} from "../packages/contracts/src/merchant.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import { withAuthHarness, withMediaWorker } from "./auth-fixture.ts";

type AuthHarness = Parameters<Parameters<typeof withAuthHarness>[1]>[0];
type MediaWorker = Parameters<Parameters<typeof withMediaWorker>[1]>[0];

function waitForRequest(page: Page, method: "POST" | "PUT", path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method && new URL(response.url()).pathname === path,
  );
}

async function signInAndFillApplication(
  page: Page,
  auth: AuthHarness,
  applicant: { input: string; phone: string },
) {
  await page.goto(auth.origin + "/ar/sign-in?continue=merchant-apply");
  await page.getByRole("textbox", { name: ar.auth.phoneLabel }).fill(applicant.input);
  await page.getByRole("button", { name: ar.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: ar.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(applicant.phone));
  await otp.press("Enter");
  const commune = await auth.seedAlgiersCommune();
  await page.getByRole("link", { name: ar.auth.continueApplication }).click();
  await expect(page.getByRole("heading", { name: ar.merchant.applicationTitle })).toBeVisible();
  await page.getByRole("textbox", { name: ar.merchant.restaurantName }).fill("مطعم تجريبي");
  await page.getByRole("textbox", { name: ar.merchant.ownerName }).fill("صاحب تجريبي");
  await page
    .getByRole("combobox", { name: ar.merchant.commune })
    .selectOption({ label: commune.nameAr });
  await page.getByRole("checkbox", { name: ar.merchant.cuisineAlgerian }).check();
  await page
    .getByRole("textbox", { name: ar.merchant.latitude })
    .fill(String(commune.pin.latitude));
  await page
    .getByRole("textbox", { name: ar.merchant.longitude })
    .fill(String(commune.pin.longitude));
  return commune;
}

/** Uploads a synthetic JPEG, crops it with the keyboard and waits until it is ready. */
async function attachCroppedPhoto(page: Page, { syntheticJpeg }: MediaWorker) {
  const reservation = waitForRequest(page, "POST", "/v1/media/uploads");
  await page.getByLabel(ar.photoUpload.choose).setInputFiles({
    name: "restaurant.jpg",
    mimeType: "image/jpeg",
    buffer: await syntheticJpeg(),
  });
  const reserved = await reservation;
  expect(reserved.request().postDataJSON()).toMatchObject({ kind: "application" });
  const { mediaId } = mediaOutput.parse(await reserved.json());

  const stage = page.getByRole("group", {
    name: ar.photoCrop.title,
    description: ar.photoCrop.instructions,
  });
  await expect(stage).toBeVisible();
  await stage.focus();
  await stage.press("ArrowLeft");
  await stage.press("+");
  const crop = waitForRequest(page, "PUT", `/v1/media/${mediaId}/crop`);
  await page.getByRole("button", { name: ar.photoCrop.confirm, exact: true }).click();
  expect((await crop).ok()).toBe(true);
  await expect(page.getByText(ar.photoUpload.ready, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  return mediaId;
}

test("[MER-01:browser] an applicant attaches a private, keyboard-cropped restaurant photo @merchant-application", async ({
  baseURL,
  page,
}) => {
  test.setTimeout(90_000);
  await withAuthHarness(baseURL, async (auth) => {
    await withMediaWorker(auth, async (worker) => {
      await signInAndFillApplication(page, auth, {
        input: "0550 00 02 95",
        phone: "+213550000295",
      });
      const mediaId = await attachCroppedPhoto(page, worker);

      const submitted = waitForRequest(page, "POST", "/v1/merchant-applications");
      await page.getByRole("button", { name: ar.merchant.submit }).click();
      const response = await submitted;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toMatchObject({ photoIds: [mediaId] });
      merchantApplicationOutput.parse(await response.json());
      await expect(page.getByRole("heading", { name: ar.merchant.submittedTitle })).toBeVisible();

      const published = await page.request.get(`${auth.origin}/media/${mediaId}/1280.webp`);
      expect(published.status()).toBe(404);
    });
  });
});

test("[MER-01:browser] a refused photo is cleared so the applicant can submit without it @merchant-application", async ({
  baseURL,
  page,
}) => {
  test.setTimeout(90_000);
  await withAuthHarness(baseURL, async (auth) => {
    await withMediaWorker(auth, async (worker) => {
      const commune = await signInAndFillApplication(page, auth, {
        input: "0550 00 02 96",
        phone: "+213550000296",
      });
      const mediaId = await attachCroppedPhoto(page, worker);

      // A second application from the same session claims the photo first.
      const me = await page.request.get(`${auth.origin}/v1/me/merchants`);
      const { sessionId } = merchantMembershipsOutput.parse(await me.json());
      const competing = await page.evaluate(
        async ({ communeId, pin, photoId, sessionId }) => {
          const response = await fetch("/v1/merchant-applications", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
              "x-expected-session-id": sessionId,
            },
            body: JSON.stringify({
              restaurantName: "مطعم منافس",
              ownerName: "صاحب تجريبي",
              communeId,
              pin,
              cuisines: ["algerian"],
              photoIds: [photoId],
            }),
          });
          return response.status;
        },
        { communeId: commune.id, pin: commune.pin, photoId: mediaId, sessionId },
      );
      expect(competing).toBe(201);

      const refused = waitForRequest(page, "POST", "/v1/merchant-applications");
      await page.getByRole("button", { name: ar.merchant.submit }).click();
      expect((await refused).status()).toBe(409);
      await expect(page.getByText(ar.merchant.photosUnavailable)).toBeVisible();
      await expect(page.getByText(ar.photoUpload.ready, { exact: true })).toBeHidden();
      await expect(page.getByLabel(ar.photoUpload.choose)).toBeAttached();

      const resubmitted = waitForRequest(page, "POST", "/v1/merchant-applications");
      await page.getByRole("button", { name: ar.merchant.submit }).click();
      const response = await resubmitted;
      expect(response.request().postDataJSON()).not.toHaveProperty("photoIds");
      expect(response.status()).toBe(201);
      await expect(page.getByRole("heading", { name: ar.merchant.submittedTitle })).toBeVisible();
    });
  });
});
