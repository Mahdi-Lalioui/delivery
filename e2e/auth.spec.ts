import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { sessionListOutput } from "../packages/contracts/src/auth.ts";
import { problemResponseSchema } from "../packages/contracts/src/health.ts";
import { withAuthHarness } from "./auth-fixture.ts";

const customerPhone = "+213500000101";
const adminPhone = "+213600000102";
const customerAccount = { phone: customerPhone, input: "٠٥٠٠٠٠٠١٠١", displayed: /0500 00 01 01/ };
const replacementAccount = {
  phone: "+213500000103",
  input: "٠٥٠٠٠٠٠١٠٣",
  displayed: /0500 00 01 03/,
};

async function requestSms(page: Page, form: { phone: string; label: string; button: string }) {
  await page.getByRole("textbox", { name: form.label }).fill(form.phone);
  const pending = page.waitForResponse((response) =>
    response.url().endsWith("/v1/auth/otp/request"),
  );
  await page.getByRole("button", { name: form.button }).click();
  const response = await pending;
  expect(response.status()).toBe(202);
}

async function browserSessions(page: Page) {
  return sessionListOutput.parse(
    await page.evaluate(async () => {
      const response = await fetch("/v1/me/sessions");
      if (response.status !== 200)
        throw new Error(`Sessions returned HTTP ${response.status.toString()}`);
      const body: unknown = await response.json();
      return body;
    }),
  ).sessions;
}

async function browserSession(page: Page) {
  const sessions = await browserSessions(page);
  const [session] = sessions;
  expect(sessions).toHaveLength(1);
  if (!session) throw new Error("The browser has no session.");
  expect(session.current).toBe(true);
  return session;
}

async function signInCustomer(page: Page, auth: AuthHarness, account = customerAccount) {
  await page.goto(auth.origin + "/ar/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await requestSms(page, {
    phone: account.input,
    label: "رقم الهاتف المحمول",
    button: "إرسال الرمز",
  });
  const code = page.getByRole("textbox", { name: "رمز الرسالة النصية" });
  await expect(code).toBeFocused();
  await expect(code).toHaveAccessibleDescription(account.displayed);
  await code.fill(auth.latestSms(account.phone));
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
      data: { scope: "all", expectedSessionId: session.id },
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

const secondaryDevice = "Zaafran QA secondary device";
const resendCooldownMs = 45_000;

async function signInSecondDevice(page: Page, auth: AuthHarness) {
  auth.advanceClock(resendCooldownMs);
  await signInCustomer(page, auth);
  const sessions = await browserSessions(page);
  expect(sessions).toHaveLength(2);
  const current = sessions.find((session) => session.current);
  if (!current) throw new Error("The second browser has no active session.");
  expect(current.deviceName).toBe(secondaryDevice);
  return current;
}

async function openDeviceList(page: Page) {
  const account = page.getByRole("link", { name: "إدارة الأجهزة" });
  await expect(account).toBeVisible();
  await account.click();
  await expect(page).toHaveURL(/\/ar\/account\/sessions$/);
  await expect(page.getByRole("heading", { name: "الأجهزة المسجّل دخولها" })).toBeVisible();
  await expect(page.getByText("هذا الجهاز", { exact: true })).toBeVisible();
}

async function revokeSecondDevice(page: Page, sessionId: string) {
  const response = page.waitForResponse(
    (result) =>
      result.request().method() === "DELETE" &&
      result.url().endsWith(`/v1/me/sessions/${sessionId}`),
  );
  const device = page.getByRole("listitem").filter({ hasText: secondaryDevice });
  await device.getByRole("button", { name: /^Déconnecter l’appareil/ }).click();
  expect((await response).status()).toBe(204);
  await expect(device).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("L’appareil est déconnecté.");
}

function waitForLogout(page: Page) {
  return page.waitForResponse(
    (result) => result.request().method() === "POST" && result.url().endsWith("/v1/auth/logout"),
  );
}

async function signOutEverywhere(page: Page, expectedSessionId: string) {
  const response = waitForLogout(page);
  await page.getByRole("button", { name: "Se déconnecter partout" }).click();
  const logout = await response;
  expect(logout.request().postDataJSON()).toEqual({ scope: "all", expectedSessionId });
  expect(logout.status()).toBe(204);
  await expect(page.getByRole("status")).toHaveText("Vous êtes déconnecté.");
  await expect(page.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
    "href",
    "/fr/sign-in",
  );
}

test("[AUTH-03] manages localized devices and signs out both live sessions @auth @devices", async ({
  baseURL,
  browser,
  ignoreHTTPSErrors,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const other = await browser.newContext({ ignoreHTTPSErrors, userAgent: secondaryDevice });
    try {
      await signInCustomer(page, auth);
      const first = await browserSession(page);
      const secondPage = await other.newPage();
      const second = await signInSecondDevice(secondPage, auth);
      const endpoint = auth.origin + "/v1/me/sessions";
      await openDeviceList(page);
      await expect(page.getByRole("listitem")).toHaveCount(2);
      await page.getByRole("link", { name: "Français" }).click();
      await expect(page).toHaveURL(/\/fr\/account\/sessions$/);
      await expect(page.getByRole("heading", { name: "Appareils connectés" })).toBeVisible();
      await expect(page.getByText("Cet appareil", { exact: true })).toBeVisible();

      await revokeSecondDevice(page, second.id);
      expect((await secondPage.request.get(endpoint)).status()).toBe(401);
      expect((await browserSession(page)).id).toBe(first.id);

      // Restore a second active session so scope=all must do more than remove the current cookie.
      expect((await signInSecondDevice(secondPage, auth)).id).not.toBe(second.id);
      await page.reload();
      await expect(page.getByRole("listitem")).toHaveCount(2);
      await signOutEverywhere(page, first.id);
      expect((await page.request.get(endpoint)).status()).toBe(401);
      expect((await secondPage.request.get(endpoint)).status()).toBe(401);
    } finally {
      await other.close();
    }
  });
});

test("[AUTH-03] rejects sign out everywhere from a stale account tab @auth @stale-account", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    await signInCustomer(page, auth);
    const previous = await browserSession(page);
    await openDeviceList(page);
    await expect(page.getByRole("listitem")).toHaveCount(1);

    const secondTab = await page.context().newPage();
    await signInCustomer(secondTab, auth, replacementAccount);
    const replacement = await browserSession(secondTab);
    expect(replacement.id).not.toBe(previous.id);
    expect(await auth.phoneForSession(replacement.id)).toBe(replacementAccount.phone);
    expect((await browserSession(page)).id).toBe(replacement.id);

    const response = waitForLogout(page);
    await page.getByRole("button", { name: "تسجيل الخروج من جميع الأجهزة" }).click();
    const rejected = await response;
    expect(rejected.status()).toBe(409);
    expect(problemResponseSchema.parse(await rejected.json()).code).toBe("session_changed");
    expect(rejected.request().postDataJSON()).toEqual({
      scope: "all",
      expectedSessionId: previous.id,
    });
    await expect(page.getByRole("listitem")).toHaveCount(0);
    expect((await browserSession(secondTab)).id).toBe(replacement.id);
  });
});
