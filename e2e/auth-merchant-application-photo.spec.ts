import { expect, test, type Page } from "@playwright/test";
import { adminMerchantReviewOutput } from "../packages/contracts/src/admin.ts";
import { mediaOutput } from "../packages/contracts/src/media.ts";
import {
  merchantApplicationOutput,
  merchantMembershipsOutput,
} from "../packages/contracts/src/merchant.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness, withMediaWorker } from "./auth-fixture.ts";
import { enterAdminQueue, waitForPost } from "./auth-sign-in.ts";

type AuthHarness = Parameters<Parameters<typeof withAuthHarness>[1]>[0];
type MediaWorker = Parameters<Parameters<typeof withMediaWorker>[1]>[0];

const restaurantName = "مطعم تجريبي";
const reviewer = { input: "0660 00 02 97", phone: "+213660000297" };
const applicant = { input: "0550 00 02 95", phone: "+213550000295" };
const reason = "Commune, identité et photo vérifiées pour cette demande fictive.";

interface ReviewTarget {
  readonly merchantId: string;
  readonly mediaId: string;
}

/** Waits for the worker's single admin SMS (D-021) and returns the path it points to. */
async function expectReviewNotice(worker: MediaWorker, { merchantId }: ReviewTarget) {
  await expect.poll(() => worker.readSms().length, { timeout: 15_000 }).toBe(1);
  const [notice] = worker.readSms();
  expect(notice).toEqual({
    phone: reviewer.phone,
    text: expect.stringMatching(/ \/fr\/admin\/merchant-applications$/),
  });
  const text = notice?.text ?? "";
  for (const secret of [restaurantName, applicant.phone, merchantId]) {
    expect(text).not.toContain(secret);
  }
  return text.slice(text.lastIndexOf(" ") + 1);
}

/** Follows the SMS path as the notified admin and approves the application. */
async function approveFromNotice(
  page: Page,
  auth: AuthHarness,
  { target, reviewPath, totp }: { target: ReviewTarget; reviewPath: string; totp: () => string },
) {
  await enterAdminQueue(page, auth, { ...reviewer, totp });
  await page.goto(auth.origin + reviewPath);
  await expect(page.getByRole("heading", { name: fr.adminMerchant.title })).toBeVisible();
  const details = await expectAdminSeesPhoto(page, auth, target);
  await details.getByRole("radio", { name: fr.adminMerchant.approve }).check();
  await details.getByLabel(fr.adminMerchant.reason, { exact: true }).fill(reason);
  const review = waitForPost(page, `/v1/admin/merchant-applications/${target.merchantId}/review`);
  await details.getByRole("button", { name: fr.adminMerchant.confirm }).click();
  const approval = await review;
  expect(approval.status()).toBe(200);
  expect(adminMerchantReviewOutput.parse(await approval.json())).toMatchObject({
    merchantId: target.merchantId,
    status: "approved",
  });
  await expect(page.getByText(fr.adminMerchant.approved, { exact: true })).toBeVisible();
}

/** Opens the application in the admin queue and checks its photo loads from the private route. */
async function expectAdminSeesPhoto(
  page: Page,
  auth: AuthHarness,
  { merchantId, mediaId }: ReviewTarget,
) {
  await page.getByRole("button", { name: restaurantName, exact: true }).click();
  const details = page.getByRole("region", { name: restaurantName });
  const photo = details.getByRole("img", {
    name: fr.adminMerchant.photoAlt.replace("{position}", "1"),
  });
  await expect(photo).toBeVisible();
  const base = `/v1/admin/merchant-applications/${merchantId}/photos/${mediaId}/`;
  await expect
    .poll(() =>
      photo.evaluate((image: HTMLImageElement) => ({
        isLoaded: image.complete && image.naturalWidth > 0,
        source: image.currentSrc,
      })),
    )
    .toEqual({
      isLoaded: true,
      source: expect.stringMatching(new RegExp(`^${auth.origin}${base}(640|1280)$`)),
    });
  return details;
}

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
  await page.getByRole("textbox", { name: ar.merchant.restaurantName }).fill(restaurantName);
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

test("[MER-01] a photo application reaches the admin by SMS and is approved after private review @merchant-application", async ({
  baseURL,
  browser,
  ignoreHTTPSErrors,
  page,
}) => {
  test.setTimeout(90_000);
  await withAuthHarness(baseURL, async (auth) => {
    await withMediaWorker(auth, async (worker) => {
      // The admin exists before the signup, so the review notice has a recipient.
      const totp = await auth.seedAdmin(reviewer.phone);
      await signInAndFillApplication(page, auth, applicant);
      const mediaId = await attachCroppedPhoto(page, worker);

      const submitted = waitForRequest(page, "POST", "/v1/merchant-applications");
      await page.getByRole("button", { name: ar.merchant.submit }).click();
      const response = await submitted;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toMatchObject({ photoIds: [mediaId] });
      const { merchantId } = merchantApplicationOutput.parse(await response.json());
      await expect(page.getByRole("heading", { name: ar.merchant.submittedTitle })).toBeVisible();

      const published = await page.request.get(`${auth.origin}/media/${mediaId}/1280.webp`);
      expect(published.status()).toBe(404);
      const privateVariant = `/v1/admin/merchant-applications/${merchantId}/photos/${mediaId}/640`;
      expect((await page.request.get(auth.origin + privateVariant)).status()).toBe(403);

      const target = { merchantId, mediaId };
      const reviewPath = await expectReviewNotice(worker, target);
      const adminContext = await browser.newContext({ ignoreHTTPSErrors });
      try {
        const adminPage = await adminContext.newPage();
        await approveFromNotice(adminPage, auth, { target, reviewPath, totp });
      } finally {
        await adminContext.close();
      }
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
