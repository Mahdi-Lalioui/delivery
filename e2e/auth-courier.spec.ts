import AxeBuilder from "@axe-core/playwright";
import { expect, request, test as base, type Page } from "@playwright/test";
import { withAuthHarness } from "./auth-fixture.ts";

import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { authenticate } from "./auth-session-helpers.ts";

async function seedCourierPage(page: Page, harness: AuthHarness) {
  const owner = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const ownerPhone = "+213550000797";
    const courierPhone = "+213550000798";
    await authenticate(owner, harness, { phone: ownerPhone });
    await authenticate(page.request, harness, { phone: courierPhone });
    await harness.seedOrderJourney({ ownerPhone, courierPhone, timeoutSeconds: 480 });
  } finally {
    await owner.dispose();
  }
}

const test = base.extend<{ courierOrigin: string }>({
  courierOrigin: [
    async ({ baseURL, page }, use) => {
      await withAuthHarness(
        baseURL,
        async (harness) => {
          await seedCourierPage(page, harness);
          await use(harness.origin);
        },
        true,
      );
    },
    { timeout: 60_000 },
  ],
});

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const courierId = "01932f18-3150-7c33-8a7a-53acfd343002";
const orderId = "01932f18-3150-7c33-8a7a-53acfd343003";
const inviteId = "01932f18-3150-7c33-8a7a-53acfd343004";

type Fixture = {
  startInDelivery?: boolean;
  lockCode?: boolean;
  waiting?: boolean;
  reloadsInvitation?: boolean;
};
async function courierFixture(page: Page, options: Fixture = {}) {
  let online = false;
  let onTheWay = options.startInDelivery ?? false;
  let delivered = false;
  const pickup = { latitude: 36.75, longitude: 3.0625 };
  const destination = { latitude: 36.761, longitude: 3.0678 };
  const order = () => ({
    merchantId,
    orderId,
    fulfilment: "delivery",
    version: delivered ? 6 : onTheWay ? 5 : 4,
    status: delivered ? "delivered" : onTheWay ? "out_for_delivery" : "ready",
    shortCode: "K7M-4QX",
    totalDzd: 1350,
    placedAt: new Date().toISOString(),
    scheduledFor: null,
    acceptanceDeadlineAt: null,
    eta: null,
  });
  await page.route("**/v1/courier/jobs", (route) =>
    route.fulfill({
      json: {
        courierId,
        merchantId,
        online,
        jobs: delivered
          ? []
          : [
              {
                order: order(),
                pickup: { restaurantName: "Table de la Casbah", pin: pickup },
                dropoff: {
                  pin: destination,
                  plusCode: "8F85Q368+94",
                  communeId: null,
                  landmark: "Porte bleue, près de la place",
                  floor: "2",
                },
                customerFirstName: "Amel",
                customerPhone: "+213500000009",
                changeDzd: 650,
                deliveryAttempt: options.waiting
                  ? { waitStartedAt: new Date(Date.now() - 610_000).toISOString(), callAttempts: 2 }
                  : { waitStartedAt: null, callAttempts: 0 },
              },
            ],
      },
    }),
  );
  if (!options.reloadsInvitation) {
    await page.route("**/v1/invitation-continuations/courier", (route) =>
      route.fulfill({ json: { pending: false } }),
    );
  }
  await page.route("**/v1/courier/invites/accept", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ displayName: "Sami" });
    const { cookie } = await route.request().allHeaders();
    expect(cookie).toContain(`__Host-courier-invitation=${inviteId}`);
    return route.fulfill({ json: { courierId, merchantId } });
  });
  await page.route("**/v1/courier/presence", (route) => {
    expect(route.request().postDataJSON()).toEqual({ online: true });
    online = true;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/v1/orders/" + orderId + "/pick-up", (route) => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 4 });
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    onTheWay = true;
    return route.fulfill({ json: order() });
  });
  await page.route("**/v1/courier/positions", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      orderId,
      positions: [{ latitude: 36.75, longitude: 3.0625, accuracyM: 10 }],
    });
    return route.fulfill({ json: { accepted: 1 } });
  });
  await page.route("**/v1/orders/" + orderId + "/deliver", (route) => {
    const payload: unknown = route.request().postDataJSON();
    expect(payload).toMatchObject({ expectedVersion: 5, proof: { kind: "code", code: "0123" } });
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    if (options.lockCode)
      return route.fulfill({
        status: 409,
        json: {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          code: "delivery_code_locked",
          requestId: orderId,
        },
      });
    delivered = true;
    return route.fulfill({ json: order() });
  });
}

test("[COU-01][COU-02][COU-03] accepts an invite, goes online and confirms pickup", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(
    baseURL,
    async (auth) => {
      await seedCourierPage(page, auth);
      await courierFixture(page, { reloadsInvitation: true });
      await page.goto(`${auth.origin}/fr/courier#invite=${inviteId}`);
      await expect(page.getByLabel("Prénom")).toBeVisible();
      await expect(page).toHaveURL(/\/fr\/courier$/u);
      const stored = await page.evaluate(
        (token) =>
          [sessionStorage, localStorage].some((storage) =>
            Object.keys(storage).some((key) => storage.getItem(key)?.includes(token)),
          ),
        inviteId,
      );
      expect(stored).toBe(false);
      expect(await page.context().cookies()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "__Host-courier-invitation",
            secure: true,
            httpOnly: true,
          }),
        ]),
      );
      await page.reload();
      await page.getByLabel("Prénom").fill("Sami");
      await page.getByRole("button", { name: "Accepter l’invitation" }).click();
      await expect(page.getByText("K7M-4QX")).toBeVisible();
      await page.getByText("Disponible", { exact: true }).click();
      await expect(page.getByRole("switch", { name: "Disponible" })).toBeChecked();
      await expect(page.getByRole("link", { name: "Google Maps", exact: true })).toHaveAttribute(
        "href",
        /36\.75%2C3\.0625/u,
      );
      await page.getByRole("button", { name: "Confirmer le retrait" }).press("Space");
      await expect(page.getByText("En livraison", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Google Maps", exact: true })).toHaveAttribute(
        "href",
        /36\.761%2C3\.0678/u,
      );
      await expect(page.getByText("Porte bleue, près de la place")).toBeVisible();
    },
    true,
  );
});

test("[COU-04][COU-05] sends a foreground fix and confirms the delivery code", async ({
  page,
  context,
  courierOrigin,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 36.75, longitude: 3.0625, accuracy: 10 });
  await courierFixture(page, { startInDelivery: true });
  await page.goto(courierOrigin + "/fr/courier/workspace");
  await page.getByText("Partager ma position", { exact: true }).click();
  await expect(page.getByText("Position partagée", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByLabel("Code de livraison").fill("0123");
  await page.getByRole("button", { name: "Confirmer la livraison" }).press("Space");
  await expect(page.getByText("Livraison confirmée", { exact: true })).toBeVisible();
  await expect(page.getByText("Aucune livraison assignée", { exact: true })).toBeVisible();
});

test("[COU-05] shows the private photo uploader when the code is locked", async ({
  page,
  courierOrigin,
}) => {
  await courierFixture(page, { startInDelivery: true, lockCode: true });
  const instant = new Date().toISOString();
  await page.route("**/v1/me/sessions", (route) =>
    route.fulfill({
      json: {
        sessions: [
          {
            id: courierId,
            createdAt: instant,
            lastSeenAt: instant,
            expiresAt: instant,
            current: true,
            deviceName: null,
          },
        ],
      },
    }),
  );
  await page.goto(courierOrigin + "/fr/courier/workspace");
  await page.getByLabel("Code de livraison").fill("٠١٢٣");
  await page.getByRole("button", { name: "Confirmer la livraison" }).press("Space");
  await expect(page.getByText("Le code est bloqué. Ajoutez une photo et un motif.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Photo de remise" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmer avec la photo" })).toBeDisabled();
});

test("[COU-06] reports an unavailable recipient after the server records the wait and calls", async ({
  page,
  courierOrigin,
}) => {
  await courierFixture(page, { startInDelivery: true, waiting: true });
  await page.route("**/v1/orders/" + orderId + "/fail", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      expectedVersion: 5,
      reason: "Destinataire absent",
    });
    return route.fulfill({
      json: {
        orderId,
        merchantId,
        status: "delivery_failed",
        version: 6,
        fulfilment: "delivery",
        shortCode: "K7M-4QX",
        totalDzd: 1350,
        placedAt: new Date().toISOString(),
        scheduledFor: null,
        acceptanceDeadlineAt: null,
        eta: null,
      },
    });
  });
  await page.goto(courierOrigin + "/fr/courier/workspace");
  await page.getByText("Un problème à la livraison", { exact: true }).click();
  await page.getByLabel("Motif").fill("Destinataire absent");
  await page.getByRole("button", { name: "Signaler l’échec" }).click();
  await expect(page.getByText("Échec de livraison enregistré", { exact: true })).toBeVisible();
});

for (const { locale, width, scheme } of [
  { locale: "ar", width: 390, scheme: "light" },
  { locale: "ar", width: 390, scheme: "dark" },
  { locale: "fr", width: 390, scheme: "light" },
  { locale: "fr", width: 1280, scheme: "light" },
  { locale: "fr", width: 1280, scheme: "dark" },
] as const) {
  test(`[COU-02] courier layout ${locale} ${String(width)} ${scheme}`, async ({
    page,
    courierOrigin,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await courierFixture(page);
    await page.goto(`${courierOrigin}/${locale}/courier/workspace`);
    await expect(page.getByText("K7M-4QX")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const confirm = page.getByRole("button", {
      name: locale === "ar" ? "تأكيد الاستلام" : "Confirmer le retrait",
    });
    expect((await confirm.boundingBox())?.height).toBeGreaterThanOrEqual(56);
    expect(errors).toEqual([]);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations.map(({ id }) => id)).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`courier-${locale}-${String(width)}-${scheme}.png`),
      fullPage: true,
    });
    await courierFixture(page, { startInDelivery: true });
    await page.reload();
    const dropoff = page.getByRole("heading", {
      name: locale === "ar" ? "تأكيد التسليم" : "Confirmer la remise",
    });
    await expect(dropoff).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(errors).toEqual([]);
    const deliveryAudit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(deliveryAudit.violations.map(({ id }) => id)).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`courier-dropoff-${locale}-${String(width)}-${scheme}.png`),
      fullPage: true,
    });
  });
}
