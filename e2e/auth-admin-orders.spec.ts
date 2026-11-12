import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { getMessages } from "../packages/i18n/src/messages.ts";
import { withAuthHarness } from "./auth-fixture.ts";

const phone = "+213550000281";
const fr = getMessages("fr");

async function signInAdmin(page: Page, auth: AuthHarness) {
  const totp = await auth.seedAdmin(phone);
  await page.goto(auth.origin + "/fr/sign-in?purpose=admin");
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill("0550 00 02 81");
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const otp = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(otp).toBeFocused();
  await otp.fill(auth.latestSms(phone));
  await otp.press("Enter");
  const factor = page.getByRole("textbox", { name: fr.auth.totpLabel });
  await expect(factor).toBeFocused();
  await factor.fill(totp());
  await factor.press("Enter");
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
}

test("[ADM-05] opens a live queue, receives an order, and audits an explicit force action", async ({
  baseURL,
  page,
}, info) => {
  await withAuthHarness(
    baseURL,
    async (auth) => {
      await signInAdmin(page, auth);
      await page.goto(auth.origin + "/fr/admin/orders");
      await expect(page.getByText("Aucune commande à afficher.", { exact: true })).toBeVisible();
      const order = await auth.seedAdminOrder();
      const ticket = page.getByRole("button", { name: new RegExp(order.shortCode) });
      await expect(ticket).toBeVisible({ timeout: 10_000 });
      await ticket.click();
      const history = page.getByRole("region", { name: "Historique de la commande" });
      await expect(
        history
          .getByRole("listitem")
          .getByText(fr.retentionOrders.status_accepted, { exact: true }),
      ).toBeVisible();

      for (const [locale, width, theme] of [
        ["ar", 390, "light"],
        ["ar", 390, "dark"],
        ["fr", 390, "light"],
        ["fr", 1280, "light"],
        ["fr", 1280, "dark"],
      ] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height: 844 });
        await page.goto(auth.origin + "/" + locale + "/admin/orders");
        await ticket.click();
        await expect(page.getByText(order.restaurantName, { exact: true }).first()).toBeVisible();
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(audit.violations.map(({ id }) => id)).toEqual([]);
        const overflows = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          return Array.from(document.querySelectorAll("main *"))
            .filter((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.width > 1 && (bounds.left < -1 || bounds.right > width + 1);
            })
            .map((element) => `${element.tagName}.${element.getAttribute("class") ?? ""}`);
        });
        expect(overflows, locale + " " + theme).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await page.screenshot({
          path: info.outputPath(`${locale}-${String(width)}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }

      await page.getByLabel("Décision", { exact: true }).selectOption("cancelled");
      await page.getByLabel("Motif de la décision").fill("Demande du client (test)");
      const write = page.waitForResponse((response) => response.url().endsWith("/force"));
      await page.getByRole("button", { name: "Confirmer la décision" }).click();
      expect((await write).status()).toBe(200);
      await expect(history.getByText("Demande du client (test)", { exact: true })).toBeVisible();
      await expect(ticket).toHaveCount(0);
    },
    true,
  );
});
