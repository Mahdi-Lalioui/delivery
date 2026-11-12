import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { verifiedIdentifiersOutput } from "../packages/contracts/src/auth.ts";
import { orderSummary } from "../packages/contracts/src/orders.ts";
import { getMessages } from "../packages/i18n/src/messages.ts";
import { withAuthHarness } from "./auth-fixture.ts";
import { authenticate } from "./auth-session-helpers.ts";

const email = "client.awid@example.test";
const ownerPhone = "+213550000452";
const orderContact = "+213550000451";
const modes = [
  { locale: "ar", width: 390, theme: "light" },
  { locale: "fr", width: 390, theme: "light" },
  { locale: "fr", width: 1280, theme: "light" },
  { locale: "ar", width: 390, theme: "dark" },
] as const;
type Mode = (typeof modes)[number];

async function capture(page: Page, info: TestInfo, screen: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    report.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target }) => target) })),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`${screen}.png`),
    fullPage: true,
    animations: "disabled",
    scale: "css",
  });
}

async function emailSignIn(
  page: Page,
  harness: AuthHarness,
  { mode, info }: { mode: Mode; info: TestInfo },
) {
  const { auth } = getMessages(mode.locale);
  await page.goto(`${harness.origin}/${mode.locale}/sign-in`);
  const chooser = page.getByRole("group", { name: auth.methodLabel });
  await expect(chooser.getByRole("radio", { name: auth.phoneMethod })).toBeChecked();
  await chooser.getByText(auth.emailMethod, { exact: true }).click();
  const address = page.getByRole("textbox", { name: auth.emailLabel });
  const send = page.getByRole("button", { name: auth.sendCode, exact: true });
  await address.fill("invalid-address");
  await send.click();
  await expect(page.getByText(auth.invalidEmail)).toBeVisible();
  await address.fill(email);
  await capture(page, info, "sign-in");
  await address.fill("CLIENT.AWID@EXAMPLE.TEST");
  await send.click();
  const code = page.getByRole("textbox", { name: auth.emailOtpLabel });
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  const [countdownLabel = ""] = auth.resendIn.split("{seconds}");
  const countdown = page.getByRole("button", { name: countdownLabel });
  await expect(countdown).toHaveText(/[1-9][0-9]?/u);
  await expect(countdown).toBeDisabled();
  await code.fill(harness.latestEmail(email));
  await code.press("Enter");
  await expect(page.getByRole("heading", { name: auth.successTitle })).toBeVisible();
}

async function addToCart(page: Page, harness: AuthHarness, locale: Mode["locale"]) {
  const owner = await page.context().browser()?.newContext({ ignoreHTTPSErrors: true });
  if (!owner) throw new Error("Expected a browser for the restaurant owner.");
  try {
    await authenticate(owner.request, harness, { phone: ownerPhone });
    const fixture = await harness.seedOrderJourney({ ownerPhone, timeoutSeconds: 480 });
    await page.goto(`${harness.origin}/${locale}/restaurants/${fixture.slug}`);
    const names =
      locale === "ar"
        ? {
            choose: "اختيار · شاورما الدجاج",
            sauce: "صلصة بيضاء",
            add: /^أضف/u,
            cart: "عرض السلة",
            checkout: "متابعة الطلب",
          }
        : {
            choose: "Choisir · Chawarma poulet",
            sauce: "Sauce blanche",
            add: /^Ajouter/u,
            cart: "Voir le panier",
            checkout: "Passer la commande",
          };
    await page.getByRole("button", { name: names.choose, exact: true }).click();
    const item = page.getByRole("dialog");
    await item.getByRole("radio", { name: names.sauce }).check();
    await item.getByRole("button", { name: names.add }).click();
    const checkout = page.getByRole("link", { name: names.checkout });
    if (!(await checkout.isVisible())) await page.getByRole("button", { name: names.cart }).click();
    await checkout.click();
  } finally {
    await owner.close();
  }
}

async function placeEmailOrder(
  page: Page,
  harness: AuthHarness,
  { mode, info }: { mode: Mode; info: TestInfo },
) {
  const { checkout } = getMessages(mode.locale);
  await addToCart(page, harness, mode.locale);
  await page.locator(".ui-segment-face").filter({ hasText: checkout.pickup }).click();
  const next = page.getByRole("button", { name: checkout.continue, exact: true });
  await next.click();
  await next.click();
  const contact = page.getByRole("textbox", { name: checkout.contactPhone });
  const submit = page.locator(".checkout-primary");
  await expect(contact).toBeVisible();
  await expect(submit).toBeDisabled();
  await contact.fill("0550 00 04 51");
  await expect(submit).toBeEnabled();
  await capture(page, info, "checkout");
  const response = page.waitForResponse(
    (result) => result.request().method() === "POST" && result.url().endsWith("/v1/orders"),
  );
  await submit.click();
  const placed = await response;
  expect(placed.status()).toBe(201);
  expect(orderSummary.parse(await placed.json())).toMatchObject({
    fulfilment: "pickup",
    status: "pending_acceptance",
  });
}

async function linkPhone(
  page: Page,
  harness: AuthHarness,
  { mode, info }: { mode: Mode; info: TestInfo },
) {
  const { accountHub, auth } = getMessages(mode.locale);
  await page.goto(`${harness.origin}/${mode.locale}/account`);
  const section = page.getByRole("region", { name: accountHub.contactTitle });
  await expect(section.getByText(email, { exact: true })).toBeVisible();
  await capture(page, info, "account");
  await section.getByRole("button", { name: accountHub.contactAdd, exact: true }).click();
  await section.getByRole("textbox", { name: auth.phoneLabel }).fill(orderContact);
  await section.getByRole("button", { name: auth.sendCode, exact: true }).click();
  const code = section.getByRole("textbox", { name: auth.otpLabel });
  await expect(code).toBeVisible();
  await code.fill(harness.latestSms(orderContact));
  await section.getByRole("button", { name: accountHub.contactSave }).click();
  await expect(section.getByRole("status")).toHaveText(accountHub.contactSaved);
  const profile = await page.request.get(harness.origin + "/v1/me/identifiers");
  expect(verifiedIdentifiersOutput.parse(await profile.json())).toMatchObject({
    phone: orderContact,
    email,
  });
}

for (const mode of modes) {
  test(`[AUTH-01] email sign-in, checkout contact and account linking · ${mode.locale} ${mode.width.toString()} ${mode.theme} @auth-email`, async ({
    baseURL,
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: mode.width, height: 844 });
    await page.emulateMedia({ colorScheme: mode.theme, reducedMotion: "reduce" });
    await withAuthHarness(
      baseURL,
      async (harness) => {
        await emailSignIn(page, harness, { mode, info });
        await placeEmailOrder(page, harness, { mode, info });
        await linkPhone(page, harness, { mode, info });
      },
      true,
    );
  });
}
