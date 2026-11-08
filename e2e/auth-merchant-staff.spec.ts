import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import ar from "../packages/i18n/src/messages/ar.json" with { type: "json" };
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { attachPageScreenshot } from "./visual.ts";

const owner = { input: "0550 00 02 81", phone: "+213550000281" };
const invitee = { input: "0550 00 02 82", phone: "+213550000282" };
const revoked = { input: "0550 00 02 83", phone: "+213550000283" };
const messages = { ar, fr } as const;

async function enterOtp(page: Page, auth: AuthHarness, account: typeof owner) {
  await page.getByRole("textbox", { name: fr.auth.phoneLabel }).fill(account.input);
  await page.getByRole("button", { name: fr.auth.sendCode }).click();
  const field = page.getByRole("textbox", { name: fr.auth.otpLabel });
  await expect(field).toBeFocused();
  await field.fill(auth.latestSms(account.phone));
  await field.press("Enter");
}

async function openTeam(page: Page, auth: AuthHarness) {
  await page.goto(auth.origin + "/fr/sign-in");
  await enterOtp(page, auth, owner);
  await expect(page.getByRole("heading", { name: fr.auth.successTitle })).toBeVisible();
  const memberships = await auth.seedMenuMemberships(owner.phone);
  const ownership = memberships.find(({ role }) => role === "owner");
  if (!ownership) throw new Error("The staff journey needs an approved owner fixture.");
  await page.goto(auth.origin + "/fr/merchant");
  await page.getByRole("link", { name: fr.merchant.manageTeam }).click();
  await expect(page).toHaveURL(`${auth.origin}/fr/merchant/${ownership.merchantId}/staff`);
  await expect(page.getByRole("heading", { name: fr.merchantStaff.title })).toBeVisible();
  return ownership;
}

async function invite(page: Page, account: typeof owner, role: string) {
  await page.getByLabel(fr.merchantStaff.invitePhone, { exact: true }).fill(account.input);
  await page.getByRole("radio", { name: new RegExp(`^${role}`) }).check();
  await page.getByRole("button", { name: fr.merchantStaff.send }).click();
  await expect(page.getByRole("status")).toHaveText(fr.merchantStaff.invited);
}

async function checkMatrix(page: Page, info: TestInfo) {
  for (const locale of ["ar", "fr"] as const) {
    await page.goto(page.url().replace(/\/(ar|fr)\//, `/${locale}/`));
    await expect(
      page.getByRole("heading", { name: messages[locale].merchantStaff.members }),
    ).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      for (const width of [390, 1280]) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await attachPageScreenshot(
          page,
          info,
          `merchant-staff-${locale}-${theme}-${String(width)}`,
        );
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        expect(overflow).toBe(0);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(violations.map(({ id }) => id)).toEqual([]);
      }
    }
  }
  await page.goto(page.url().replace("/ar/", "/fr/"));
}

test("[MER-23:browser] an owner invites staff, revokes an invitation, and the invitee joins once @merchant-staff", async ({
  baseURL,
  browser,
  page,
}, info) => {
  await withAuthHarness(baseURL, async (auth) => {
    const { restaurantName } = await openTeam(page, auth);

    await test.step("Reject an invalid phone and focus it", async () => {
      await page.getByLabel(fr.merchantStaff.invitePhone, { exact: true }).fill("12");
      await page.getByRole("button", { name: fr.merchantStaff.send }).click();
      await expect(page.getByText(fr.merchantStaff.phoneError)).toBeVisible();
      await expect(page.getByLabel(fr.merchantStaff.invitePhone, { exact: true })).toBeFocused();
    });

    await test.step("Invite a manager, then revoke the invitation", async () => {
      await invite(page, revoked, fr.merchantStaff.roleManager);
      const revoke = page.getByRole("button", {
        name: fr.merchantStaff.revoke.replace("{phone}", revoked.input),
      });
      await revoke.click();
      await expect(page.getByRole("status")).toHaveText(fr.merchantStaff.revoked);
      await expect(revoke).toHaveCount(0);
    });

    await test.step("Invite the staff member", async () => {
      await invite(page, invitee, fr.merchantStaff.roleStaff);
      await expect(page.getByText(invitee.input, { exact: true })).toBeVisible();
    });

    await test.step("Check the theme, locale and viewport matrix", async () => {
      await checkMatrix(page, info);
    });

    const token = auth.latestInvitation(invitee.phone);
    const inviteeContext = await browser.newContext();
    try {
      const inviteePage = await inviteeContext.newPage();
      await test.step("The signed-out invitee signs in and accepts", async () => {
        await inviteePage.goto(`${auth.origin}/fr/staff/accept#token=${token}`);
        await expect(inviteePage.getByText(fr.merchantStaff.acceptSignIn)).toBeVisible();
        await expect(inviteePage).toHaveURL(`${auth.origin}/fr/staff/accept`);
        await inviteePage.getByRole("link", { name: fr.merchantStaff.signIn }).click();
        await enterOtp(inviteePage, auth, invitee);
        await inviteePage.getByRole("link", { name: fr.auth.continueInvitation }).click();
        const accepted = inviteePage.getByRole("status");
        await expect(accepted).toContainText(restaurantName);
        await expect(accepted).toContainText(fr.merchantStaff.roleStaff);
      });

      await test.step("The same link cannot be used again", async () => {
        // A fresh tab, as a second tap on the SMS link; a same-page hash change would not reload.
        const replay = await inviteeContext.newPage();
        await replay.goto(`${auth.origin}/fr/staff/accept#token=${token}`);
        await expect(replay.getByText(fr.merchantStaff.acceptNotFound)).toBeVisible();
        await replay.close();
      });

      await inviteePage.goto(auth.origin + "/fr/merchant");
      await expect(inviteePage.getByText(restaurantName, { exact: true })).toBeVisible();
      await expect(inviteePage.getByRole("link", { name: fr.merchant.manageTeam })).toHaveCount(0);
    } finally {
      await inviteeContext.close();
    }

    await page.reload();
    const members = page.getByRole("region", { name: fr.merchantStaff.members });
    await expect(members.getByText(invitee.input, { exact: true })).toBeVisible();
    await expect(page.getByText(fr.merchantStaff.noInvitations)).toBeVisible();
  });
});
