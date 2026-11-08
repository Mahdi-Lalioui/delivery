import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import {
  adminMerchantReviewOutput,
  adminReviewQueueOutput,
} from "../packages/contracts/src/admin.ts";
import { problemResponseSchema } from "../packages/contracts/src/health.ts";
import {
  merchantApplicationOutput,
  merchantMembershipsOutput,
} from "../packages/contracts/src/merchant.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPhoto } from "./media-photo-fixture.ts";

const applicant = { input: "٠٥٥٠٠٠٠٢٠١", phone: "+213550000201" };
const reviewer = { input: "0660 00 02 02", phone: "+213660000202" };
const replacementApplicant = { input: "٠٥٥٠٠٠٠٢٠٣", phone: "+213550000203" };
const replacementReviewer = { input: "0660 00 02 04", phone: "+213660000204" };
const restaurantName = "مطعم الياسمين التجريبي";
const ownerName = "صاحب المطعم التجريبي";
const reason = "Commune et identité vérifiées pour cette demande fictive.";
const applicationEndpoint = "/v1/merchant-applications";
const queueEndpoint = "/v1/admin/merchant-applications";
const membershipsEndpoint = "/v1/me/merchants";

function waitForPost(page: Page, path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === path,
  );
}

async function enterOtp(
  page: Page,
  auth: AuthHarness,
  { account, labels }: { account: typeof applicant; labels: typeof ar.auth },
) {
  await page.getByRole("textbox", { name: labels.phoneLabel }).fill(account.input);
  const request = waitForPost(page, "/v1/auth/otp/request");
  await page.getByRole("button", { name: labels.sendCode }).click();
  expect((await request).status()).toBe(202);

  const field = page.getByRole("textbox", { name: labels.otpLabel });
  await expect(field).toBeFocused();
  await field.fill(auth.latestSms(account.phone));
  await field.press("Enter");
}

async function enterMerchantApplication(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/ar");
  await page.getByRole("link", { name: ar.merchant.startApplication }).click();
  await page.getByRole("link", { name: ar.merchant.signIn }).click();
  await expect(page).toHaveURL(auth.origin + "/ar/sign-in?continue=merchant-apply");
  await enterOtp(page, auth, { account: applicant, labels: ar.auth });
  const continueLink = page.getByRole("link", { name: ar.auth.continueApplication });
  await expect(continueLink).toHaveAttribute("href", "/ar/merchant/apply");
  const commune = await auth.seedAlgiersCommune();
  await continueLink.click();
  await expect(page).toHaveURL(auth.origin + "/ar/merchant/apply");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: ar.merchant.applicationTitle })).toBeVisible();
  await page.getByRole("textbox", { name: ar.merchant.restaurantName }).fill(restaurantName);
  await page.getByRole("textbox", { name: ar.merchant.ownerName }).fill(ownerName);
  await page.getByRole("combobox", { name: ar.merchant.commune }).selectOption({
    label: commune.nameAr,
  });
  await page.getByRole("checkbox", { name: ar.merchant.cuisineAlgerian }).check();
  return commune;
}

async function submitPin(page: Page, pin: { latitude: number; longitude: number }) {
  await page.getByRole("textbox", { name: ar.merchant.latitude }).fill(pin.latitude.toString());
  await page.getByRole("textbox", { name: ar.merchant.longitude }).fill(pin.longitude.toString());
  const response = waitForPost(page, applicationEndpoint);
  await page.getByRole("button", { name: ar.merchant.submit }).click();
  return response;
}

async function expectMembership(
  page: Page,
  auth: AuthHarness,
  {
    merchantId,
    status,
  }: { merchantId: string; status: "pending_review" | "approved" | "rejected" },
) {
  await expect(page).toHaveURL(auth.origin + "/ar/merchant");
  await expect(page.getByText(restaurantName, { exact: true })).toBeVisible();
  const labels = {
    pending_review: ar.merchant.statusPending,
    approved: ar.merchant.statusApproved,
    rejected: ar.merchant.statusRejected,
  };
  await expect(page.getByText(labels[status], { exact: true })).toBeVisible();
  const response = await page.request.get(auth.origin + membershipsEndpoint);
  expect(response.status()).toBe(200);
  expect(merchantMembershipsOutput.parse(await response.json()).memberships).toEqual([
    { merchantId, restaurantName, role: "owner", status },
  ]);
}

async function enterAdminQueue(page: Page, auth: AuthHarness, account = reviewer) {
  const totp = await auth.seedAdmin(account.phone);
  await page.goto(auth.origin + "/fr/sign-in?continue=admin-review");
  await expect(page.getByRole("heading", { name: fr.auth.adminTitle })).toBeVisible();
  await enterOtp(page, auth, { account, labels: fr.auth });
  const factor = page.getByRole("textbox", { name: fr.auth.totpLabel });
  await expect(factor).toBeFocused();
  await factor.fill(totp());
  await factor.press("Enter");
  await page.getByRole("link", { name: fr.auth.continueReview }).click();
  await expect(page).toHaveURL(auth.origin + "/fr/admin/merchant-applications");
  await expect(page.getByRole("heading", { name: fr.adminMerchant.title })).toBeVisible();
}

async function prepareReview(
  page: Page,
  communeName: string,
  decision: "approve" | "reject" = "approve",
) {
  const row = page.getByRole("button", { name: restaurantName, exact: true });
  await row.click();
  const details = page.getByRole("region", { name: restaurantName });
  await expect(details.getByText(ownerName, { exact: true })).toBeVisible();
  await expect(details.getByText(communeName, { exact: true })).toBeVisible();
  await details.getByRole("radio", { name: fr.adminMerchant[decision] }).check();
  await details.getByLabel(fr.adminMerchant.reason, { exact: true }).fill(reason);
  return { row, details };
}

async function expectPhoneToFitAtDoubleText(page: Page, phone: string) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The admin browser needs a viewport.");
  await page.setViewportSize({ width: 360, height: 844 });
  try {
    const layout = await page.getByText(phone, { exact: true }).evaluate(async (number) => {
      await document.fonts.ready;
      const cell = number.closest("dd");
      if (!cell) throw new Error("The phone is missing its detail cell.");
      const originals = Array.from(
        document.querySelectorAll<HTMLElement>("header *, main *"),
        (node) => {
          const style = getComputedStyle(node);
          return {
            node,
            size: parseFloat(style.fontSize),
            line: parseFloat(style.lineHeight),
            inlineSize: node.style.fontSize,
            inlineLine: node.style.lineHeight,
          };
        },
      );

      for (const { node, size, line } of originals) {
        if (Number.isFinite(size)) node.style.fontSize = String(size * 2) + "px";
        if (Number.isFinite(line)) node.style.lineHeight = String(line * 2) + "px";
      }

      const range = document.createRange();
      range.selectNodeContents(number);
      const bounds = Array.from(range.getClientRects());
      const column = cell.getBoundingClientRect();
      const fits = bounds.every(
        ({ left, right }) => left >= column.left - 1 && right <= column.right + 1,
      );
      const overflow = document.documentElement.scrollWidth - innerWidth;
      for (const { node, inlineSize, inlineLine } of originals) {
        node.style.fontSize = inlineSize;
        node.style.lineHeight = inlineLine;
      }
      return { lines: bounds.length, fits, overflow };
    });
    expect(layout).toEqual({ lines: 1, fits: true, overflow: 0 });
  } finally {
    await page.setViewportSize(viewport);
  }
}

async function approveApplication(page: Page, merchantId: string, communeName: string) {
  const { row, details } = await prepareReview(page, communeName);
  await expectPhoneToFitAtDoubleText(page, "0550 00 02 01");
  const response = waitForPost(page, `${queueEndpoint}/${merchantId}/review`);
  await details.getByRole("button", { name: fr.adminMerchant.confirm }).click();
  const approval = await response;
  expect(approval.status()).toBe(200);
  expect(approval.request().postDataJSON()).toEqual({ decision: "approve", reason });
  expect(adminMerchantReviewOutput.parse(await approval.json())).toMatchObject({
    merchantId,
    status: "approved",
  });
  await expect(page.getByText(fr.adminMerchant.approved, { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
}

test("[MER-01:browser] [ADM-03:browser] submits and reviews an Algiers merchant application @merchant-application", async ({
  baseURL,
  browser,
  ignoreHTTPSErrors,
  page,
}) => {
  await withAuthHarness(
    baseURL,
    async (auth) => {
      const { merchantId, communeName } =
        await test.step("The Arabic applicant submits an eligible location", async () => {
          const commune = await enterMerchantApplication(page, auth);
          const invalid = await submitPin(page, { latitude: 0, longitude: 0 });
          expect(invalid.status()).toBe(422);
          expect(problemResponseSchema.parse(await invalid.json()).code).toBe("outside_commune");
          await expect(
            page.getByRole("alert").filter({ hasText: ar.merchant.outsideCommune }),
          ).toBeVisible();

          const photoId = await attachPhoto(page, ar.mediaPhoto);
          const response = await submitPin(page, commune.pin);
          expect(response.status()).toBe(201);
          expect(response.request().postDataJSON()).toMatchObject({
            communeId: commune.id,
            pin: commune.pin,
            photoIds: [photoId],
          });
          const created = merchantApplicationOutput.parse(await response.json());
          await expect(
            page.getByRole("heading", { name: ar.merchant.submittedTitle }),
          ).toBeVisible();
          await page.getByRole("link", { name: ar.merchant.viewStatus }).click();
          await expectMembership(page, auth, {
            merchantId: created.merchantId,
            status: "pending_review",
          });
          return { merchantId: created.merchantId, communeName: commune.nameFr };
        });

      const adminContext = await browser.newContext({ ignoreHTTPSErrors });
      try {
        await test.step("A separate French administrator approves the application", async () => {
          const adminPage = await adminContext.newPage();
          await enterAdminQueue(adminPage, auth);
          await approveApplication(adminPage, merchantId, communeName);
          await expect(adminPage.locator('a[hreflang="ar-DZ"]')).toHaveCount(0);
        });
        await test.step("The applicant sees approval but cannot read the admin queue", async () => {
          await page.reload();
          await expectMembership(page, auth, { merchantId, status: "approved" });
          const denied = await page.request.get(auth.origin + queueEndpoint);
          expect(denied.status()).toBe(403);
          expect(problemResponseSchema.parse(await denied.json()).code).toBe("forbidden");
        });
      } finally {
        await adminContext.close();
      }
    },
    true,
  );
});

test("[MER-01:browser] replays a committed application after a lost response and rate limit @merchant-application", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const commune = await enterMerchantApplication(page, auth);
    const keys: string[] = [];
    let committedId: string | undefined;
    await page.route("**" + applicationEndpoint, async (route) => {
      const key = route.request().headers()["idempotency-key"];
      if (!key) throw new Error("The application request has no idempotency key.");
      keys.push(key);
      if (keys.length === 1) {
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        committedId = merchantApplicationOutput.parse(await committed.json()).merchantId;
        await route.abort("failed");
      } else if (keys.length === 2) {
        await route.fulfill({ status: 429, body: "" });
      } else {
        await route.continue();
      }
    });

    await page
      .getByRole("textbox", { name: ar.merchant.latitude })
      .fill(String(commune.pin.latitude));
    await page
      .getByRole("textbox", { name: ar.merchant.longitude })
      .fill(String(commune.pin.longitude));
    const submit = page.getByRole("button", { name: ar.merchant.submit });
    await submit.click();
    await expect(
      page.getByRole("alert").filter({ hasText: ar.merchant.submitError }),
    ).toBeVisible();
    await submit.click();
    await expect(
      page.getByRole("alert").filter({ hasText: ar.merchant.rateLimited }),
    ).toBeVisible();
    await submit.click();
    await expect(page.getByRole("heading", { name: ar.merchant.submittedTitle })).toBeVisible();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    if (!committedId) throw new Error("No application was committed.");
    await page.getByRole("link", { name: ar.merchant.viewStatus }).click();
    await expectMembership(page, auth, { merchantId: committedId, status: "pending_review" });
  });
});

test("[AUTH-06] [MER-01:browser] [ADM-03:browser] stale merchant and admin tabs cannot submit as replacement accounts @merchant-application", async ({
  baseURL,
  browser,
  ignoreHTTPSErrors,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const commune = await enterMerchantApplication(page, auth);
    const membership = await page.request.get(auth.origin + membershipsEndpoint);
    const firstSession = merchantMembershipsOutput.parse(await membership.json()).sessionId;

    const otherTab = await page.context().newPage();
    await otherTab.goto(auth.origin + "/ar/sign-in");
    await enterOtp(otherTab, auth, { account: replacementApplicant, labels: ar.auth });
    await expect(otherTab.getByRole("heading", { name: ar.auth.successTitle })).toBeVisible();
    const replacement = await otherTab.request.get(auth.origin + membershipsEndpoint);
    const replacementSession = merchantMembershipsOutput.parse(await replacement.json()).sessionId;
    expect(replacementSession).not.toBe(firstSession);

    const staleApplication = await submitPin(page, commune.pin);
    expect(staleApplication.request().headers()["x-expected-session-id"]).toBe(firstSession);
    expect(staleApplication.status()).toBe(409);
    expect(problemResponseSchema.parse(await staleApplication.json()).code).toBe("session_changed");
    await expect(
      page.getByRole("alert").filter({ hasText: ar.merchant.sessionChanged }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: ar.merchant.ownerName })).toHaveCount(0);
    expect(
      merchantMembershipsOutput.parse(
        await (await otherTab.request.get(auth.origin + membershipsEndpoint)).json(),
      ).memberships,
    ).toEqual([]);

    const retry = await otherTab.request.post(auth.origin + applicationEndpoint, {
      headers: {
        origin: auth.origin,
        "sec-fetch-site": "same-origin",
        "idempotency-key": "fixture-current-application",
        "x-expected-session-id": replacementSession,
      },
      data: {
        restaurantName,
        ownerName,
        communeId: commune.id,
        pin: commune.pin,
        cuisines: ["algerian"],
      },
    });
    expect(retry.status()).toBe(201);
    const { merchantId } = merchantApplicationOutput.parse(await retry.json());

    const adminContext = await browser.newContext({ ignoreHTTPSErrors });
    try {
      const oldAdminTab = await adminContext.newPage();
      await enterAdminQueue(oldAdminTab, auth);
      const queue = await oldAdminTab.request.get(auth.origin + queueEndpoint);
      const firstAdminSession = adminReviewQueueOutput.parse(await queue.json()).sessionId;
      const { details } = await prepareReview(oldAdminTab, commune.nameFr);

      const newAdminTab = await adminContext.newPage();
      await enterAdminQueue(newAdminTab, auth, replacementReviewer);
      const newQueue = await newAdminTab.request.get(auth.origin + queueEndpoint);
      expect(adminReviewQueueOutput.parse(await newQueue.json()).sessionId).not.toBe(
        firstAdminSession,
      );

      const pending = waitForPost(oldAdminTab, queueEndpoint + "/" + merchantId + "/review");
      await details.getByRole("button", { name: fr.adminMerchant.confirm }).click();
      const staleReview = await pending;
      expect(staleReview.request().headers()["x-expected-session-id"]).toBe(firstAdminSession);
      expect(staleReview.status()).toBe(409);
      expect(problemResponseSchema.parse(await staleReview.json()).code).toBe("session_changed");
      await expect(
        oldAdminTab.getByRole("alert").filter({ hasText: fr.adminMerchant.sessionChanged }),
      ).toBeVisible();
      await expect(oldAdminTab.getByText(ownerName, { exact: true })).toHaveCount(0);
      await expect(oldAdminTab.getByRole("button", { name: restaurantName })).toHaveCount(0);

      const after = await newAdminTab.request.get(auth.origin + queueEndpoint);
      expect(adminReviewQueueOutput.parse(await after.json()).applications).toEqual([
        expect.objectContaining({ merchantId }),
      ]);

      const current = await prepareReview(newAdminTab, commune.nameFr, "reject");
      await expect(current.details.getByText("0550 00 02 03", { exact: true })).toBeVisible();
      const rejection = waitForPost(newAdminTab, queueEndpoint + "/" + merchantId + "/review");
      await current.details.getByRole("button", { name: fr.adminMerchant.confirm }).click();
      const rejected = await rejection;
      expect(rejected.status()).toBe(200);
      expect(adminMerchantReviewOutput.parse(await rejected.json()).status).toBe("rejected");
      await expect(newAdminTab.getByText(fr.adminMerchant.rejected, { exact: true })).toBeVisible();

      await otherTab.goto(auth.origin + "/ar/merchant");
      await expectMembership(otherTab, auth, { merchantId, status: "rejected" });
    } finally {
      await adminContext.close();
    }
  });
});
