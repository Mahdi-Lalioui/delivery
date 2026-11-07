import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { sessionListOutput } from "../packages/contracts/src/auth.ts";
import { withAuthHarness } from "./auth-fixture.ts";

const customerPhone = "+213500000101";
const adminPhone = "+213600000102";

async function requestSms(page: Page, form: { phone: string; label: string; button: string }) {
  await page.getByRole("textbox", { name: form.label }).fill(form.phone);
  const pending = page.waitForResponse((response) =>
    response.url().endsWith("/v1/auth/otp/request"),
  );
  await page.getByRole("button", { name: form.button }).click();
  const response = await pending;
  expect(response.status()).toBe(202);
}

async function browserSession(page: Page) {
  const sessions = sessionListOutput.parse(
    await page.evaluate(async () => {
      const response = await fetch("/v1/me/sessions");
      if (response.status !== 200)
        throw new Error(`Sessions returned HTTP ${response.status.toString()}`);
      const body: unknown = await response.json();
      return body;
    }),
  );
  const [session] = sessions.sessions;
  expect(sessions.sessions).toHaveLength(1);
  if (!session) throw new Error("The browser has no session.");
  expect(session.current).toBe(true);
  return session;
}

async function signInCustomer(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/ar/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await requestSms(page, {
    phone: "٠٥٠٠٠٠٠١٠١",
    label: "رقم الهاتف المحمول",
    button: "إرسال الرمز",
  });
  const code = page.getByRole("textbox", { name: "رمز الرسالة النصية" });
  await expect(code).toBeFocused();
  await expect(code).toHaveAccessibleDescription(/0500 00 01 01/);
  await code.fill(auth.latestSms(customerPhone));
  await code.press("Enter");
  await expect(page.getByRole("heading", { name: "تم تسجيل الدخول" })).toBeVisible();
}

test("[CUS-10] [AUTH-03] [AUTH-04] [I18N-04] completes Arabic sign-in with a protected web session @auth", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    await signInCustomer(page, auth);
    const cookie = (await page.context().cookies(auth.origin)).find(
      ({ name }) => name === "__Host-session",
    );
    expect(cookie).toMatchObject({
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    expect(await page.evaluate(() => document.cookie)).not.toContain("__Host-session=");
    const session = await browserSession(page);
    expect(await auth.phoneForSession(session.id)).toBe(customerPhone);
    const rejected = await page.request.post(auth.origin + "/v1/auth/logout", {
      data: { scope: "all" },
      headers: {
        origin: "https://unrelated.example",
        "sec-fetch-site": "cross-site",
        "idempotency-key": randomUUID(),
      },
    });
    expect(rejected.status()).toBe(403);
    expect((await browserSession(page)).id).toBe(session.id);
  });
});

async function signInAdmin(page: Page, auth: AuthHarness) {
  const totp = await auth.seedAdmin(adminPhone);
  await page.goto(auth.origin + "/fr/sign-in?purpose=admin");
  await expect(page.getByRole("heading", { name: "Connexion administrateur" })).toBeVisible();
  await requestSms(page, {
    phone: "0600 00 01 02",
    label: "Numéro de mobile",
    button: "Envoyer le code",
  });
  const otpField = page.getByRole("textbox", { name: "Code SMS" });
  await expect(otpField).toBeFocused();
  await otpField.fill(auth.latestSms(adminPhone));
  await otpField.press("Enter");

  const totpField = page.getByRole("textbox", { name: "Code d’authentification" });
  await expect(totpField).toBeFocused();
  await expect(totpField).toHaveAccessibleDescription(
    "Ouvrez votre application d’authentification et saisissez le code à six chiffres affiché.",
  );
  expect((await page.request.get(auth.origin + "/v1/me/sessions")).status()).toBe(401);
  await totpField.fill(totp());
  await totpField.press("Enter");
  await expect(page.getByRole("heading", { name: "Vous êtes connecté" })).toBeVisible();
}

test("[AUTH-05] requires a localized second factor and expires only the admin session @auth", async ({
  baseURL,
  browser,
  ignoreHTTPSErrors,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const adminContext = await browser.newContext({ ignoreHTTPSErrors });
    try {
      await signInCustomer(page, auth);
      const customer = await browserSession(page);
      const adminPage = await adminContext.newPage();
      await signInAdmin(adminPage, auth);
      const admin = await browserSession(adminPage);
      const adminLifetime = 12 * 60 * 60 * 1000;
      expect(Date.parse(admin.expiresAt) - Date.parse(admin.createdAt)).toBe(adminLifetime);
      expect(await auth.phoneForSession(admin.id)).toBe(adminPhone);
      expect((await browserSession(page)).id).toBe(customer.id);

      auth.advanceClock(adminLifetime);
      expect((await adminPage.request.get(auth.origin + "/v1/me/sessions")).status()).toBe(401);
      expect((await browserSession(page)).id).toBe(customer.id);
    } finally {
      await adminContext.close();
    }
  });
});
