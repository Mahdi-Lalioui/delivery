import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { problemResponseSchema } from "../packages/contracts/src/health.ts";
import { merchantOnboardingOutput } from "../packages/contracts/src/merchant.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";

const phone = "+213550000231";
const labels = ar.merchantOnboarding;

async function signIn(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/ar/sign-in");
  await page.getByRole("textbox", { name: ar.auth.phoneLabel }).fill("٠٥٥٠٠٠٠٢٣١");
  await page.getByRole("button", { name: ar.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: ar.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: ar.auth.successTitle })).toBeVisible();
}

function onboardingPath(merchantId: string) {
  return `/v1/merchants/${merchantId}/onboarding`;
}

async function openOwnerChecklist(page: Page, auth: AuthHarness) {
  const fixtures = await auth.seedMenuMemberships(phone);
  const owner = fixtures.find(({ role }) => role === "owner");
  const staff = fixtures.find(({ role }) => role === "staff");
  if (!owner || !staff) throw new Error("The checklist journey needs owner and staff fixtures.");

  await page.goto(auth.origin + "/ar/merchant");
  const ownerPath = `/ar/merchant/${owner.merchantId}/setup`;
  const ownerCard = page.getByRole("listitem").filter({ hasText: owner.restaurantName });
  const staffCard = page.getByRole("listitem").filter({ hasText: staff.restaurantName });
  await expect(staffCard).toBeVisible();
  await expect(staffCard.getByRole("link", { name: ar.merchant.viewSetup })).toHaveCount(0);
  const setup = ownerCard.getByRole("link", { name: ar.merchant.viewSetup });
  await expect(setup).toHaveAttribute("href", ownerPath);
  await setup.click();
  await expect(page).toHaveURL(auth.origin + ownerPath);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: labels.title, exact: true })).toBeVisible();
  await expect(page.getByText(owner.restaurantName, { exact: true })).toBeVisible();
  return { owner, staff };
}

function checklistStep(page: Page, name: string) {
  return page
    .getByRole("list", { name: labels.checklist })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name, exact: true }),
    });
}

async function expectChecklist(
  page: Page,
  merchantId: string,
  { items, hours }: { items: 0 | 5; hours: "incomplete" | "complete" },
) {
  const progress = page.getByRole("progressbar", { name: labels.menu });
  await expect(progress).toHaveAttribute("value", items.toString());
  await expect(progress).toHaveAttribute("max", "5");
  await expect(progress).toHaveAccessibleDescription(
    labels.menuProgress.replace("{completed}", items.toString()).replace("{required}", "5"),
  );
  await expect(
    checklistStep(page, labels.menu).getByText(items === 5 ? labels.complete : labels.incomplete, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    checklistStep(page, labels.profile).getByText(labels.complete, { exact: true }),
  ).toBeVisible();
  await expect(
    checklistStep(page, labels.hours).getByText(labels[hours], { exact: true }),
  ).toBeVisible();
  for (const step of [labels.deliveryZone, labels.testOrder]) {
    await expect(
      checklistStep(page, step).getByText(labels.unavailable, { exact: true }),
    ).toBeVisible();
  }
  const goLive = page.getByRole("region", { name: labels.goLive });
  await expect(goLive.getByText(labels.unavailable, { exact: true })).toBeVisible();
  await expect(goLive.getByRole("button").or(goLive.getByRole("link"))).toHaveCount(0);

  const response = await page.request.get(new URL(onboardingPath(merchantId), page.url()).href);
  expect(response.status()).toBe(200);
  expect(merchantOnboardingOutput.parse(await response.json())).toMatchObject({
    merchantId,
    steps: {
      profile: "complete",
      hours,
      menu: { itemsTowardMinimum: items, requiredItems: 5 },
      deliveryZone: "unavailable",
      testOrder: "unavailable",
    },
    canGoLive: false,
  });
}

test("[MER-02:browser] shows stored progress while activation stays unavailable @onboarding-checklist", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    await signIn(page, auth);
    const { owner, staff } = await openOwnerChecklist(page, auth);
    await expectChecklist(page, owner.merchantId, { items: 0, hours: "incomplete" });
    await auth.seedOnboardingProgress(owner.merchantId);
    await page.reload();
    await expectChecklist(page, owner.merchantId, { items: 5, hours: "complete" });

    const staffResponse = await page.request.get(auth.origin + onboardingPath(staff.merchantId));
    expect(staffResponse.status()).toBe(404);
    expect(problemResponseSchema.parse(await staffResponse.json()).code).toBe("not_found");
  });
});
