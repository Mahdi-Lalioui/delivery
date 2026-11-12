import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { merchantDeliverySettingsOutput } from "../packages/contracts/src/merchant-delivery.ts";
import { getMessages } from "../packages/i18n/src/messages.ts";
import { withAuthHarness } from "./auth-fixture.ts";

const phone = "+213550000277";
const fr = getMessages("fr");

async function signIn(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 77");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const memberships = await auth.seedMenuMemberships(phone);
  const owner = memberships.find(({ role }) => role === "owner");
  if (!owner) throw new Error("Expected a synthetic owner membership.");
  return owner.merchantId;
}

test("[MER-17] updates coverage and recovers from a stale draft in the merchant UI", async ({
  baseURL,
  page,
}, info) => {
  await withAuthHarness(baseURL, async (auth) => {
    const merchantId = await signIn(page, auth);
    const route = "/merchant/" + merchantId + "/delivery-settings";
    const endpoint = auth.origin + "/v1/merchants/" + merchantId + "/delivery-settings";
    await page.goto(auth.origin + "/fr" + route);
    await expect(page.getByRole("heading", { name: "Livraison et retrait" })).toBeVisible();
    await page.getByText("Livraison", { exact: true }).click();
    await expect(page.getByRole("switch", { name: /^Livraison/u })).toBeChecked();
    await page.getByText("Retrait sur place", { exact: true }).click();
    await expect(page.getByRole("switch", { name: /^Retrait sur place/u })).toBeChecked();
    await page.getByLabel("Rayon de livraison").fill("4");
    await page.getByLabel("Frais de livraison").fill("190");
    const save = page.getByRole("button", { name: "Enregistrer" });
    await save.click();
    await expect(page.getByText("Paramètres enregistrés.", { exact: true })).toBeVisible();

    const current = merchantDeliverySettingsOutput.parse(
      await (await page.request.get(endpoint)).json(),
    );
    expect(current.settings).toMatchObject({
      pickupEnabled: true,
      deliveryEnabled: true,
      zone: { radiusMeters: 4000, feeDzd: 190 },
    });
    const changed = await page.request.put(endpoint, {
      headers: {
        Origin: auth.origin,
        "Idempotency-Key": randomUUID(),
        "x-expected-session-id": current.sessionId,
      },
      data: { ...current.settings, prepMinutes: 30, expectedRevision: current.revision },
    });
    expect(changed.status()).toBe(200);
    await page.getByLabel("Frais de livraison").fill("250");
    await save.click();
    const reload = page.getByRole("button", { name: "Recharger les paramètres" });
    await expect(reload).toBeFocused();
    await reload.click();
    await expect(page.getByLabel("Temps de préparation")).toHaveValue("30");
    await expect(page.getByLabel("Frais de livraison")).toHaveValue("190");

    for (const [locale, width, theme] of [
      ["ar", 390, "light"],
      ["ar", 390, "dark"],
      ["fr", 390, "light"],
      ["fr", 1280, "dark"],
    ] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 860 });
      await page.goto(auth.origin + "/" + locale + route);
      await expect(page.getByRole("form")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(audit.violations.map(({ id }) => id)).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${locale}-${String(width)}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  });
});
