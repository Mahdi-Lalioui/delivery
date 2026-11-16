import { expect, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };

export interface TestAccount {
  readonly input: string;
  readonly phone: string;
}

export function waitForPost(page: Page, path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === path,
  );
}

export async function enterOtp(
  page: Page,
  auth: AuthHarness,
  { account, labels }: { account: TestAccount; labels: typeof fr.auth },
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

/** Signs a seeded French administrator in with OTP and TOTP and opens the review queue. */
export async function enterAdminQueue(
  page: Page,
  auth: AuthHarness,
  account: TestAccount & { readonly totp?: () => string },
) {
  const totp = account.totp ?? (await auth.seedAdmin(account.phone));
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
