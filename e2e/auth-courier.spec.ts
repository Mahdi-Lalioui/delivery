import { expect, test, type Page } from "@playwright/test";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const courierId = "01932f18-3150-7c33-8a7a-53acfd343002";
const orderId = "01932f18-3150-7c33-8a7a-53acfd343003";
const inviteId = "01932f18-3150-7c33-8a7a-53acfd343004";

async function courierFixture(page: Page) {
  let online = false;
  let onTheWay = false;
  const pickup = { latitude: 36.75, longitude: 3.0625 };
  const destination = { latitude: 36.761, longitude: 3.0678 };
  const order = () => ({
    merchantId,
    orderId,
    fulfilment: "delivery",
    version: onTheWay ? 5 : 4,
    status: onTheWay ? "out_for_delivery" : "ready",
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
        jobs: [
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
            deliveryAttempt: { waitStartedAt: null, callAttempts: 0 },
          },
        ],
      },
    }),
  );
  await page.route("**/v1/courier/invites/accept", (route) => {
    expect(route.request().postDataJSON()).toEqual({ inviteId, displayName: "Sami" });
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
}

test("[COU-01][COU-02][COU-03] accepts an invite, goes online and confirms pickup", async ({
  page,
}) => {
  await courierFixture(page);
  await page.goto("/fr/courier#invite=" + inviteId);
  await expect(page).toHaveURL(/\/fr\/courier$/u);
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
});

for (const { locale, width, scheme } of [
  { locale: "ar", width: 390, scheme: "light" },
  { locale: "fr", width: 390, scheme: "light" },
  { locale: "fr", width: 1280, scheme: "light" },
  { locale: "fr", width: 1280, scheme: "dark" },
] as const) {
  test(`[COU-02] courier layout ${locale} ${String(width)} ${scheme}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await courierFixture(page);
    await page.goto(`/${locale}/courier`);
    await expect(page.getByText("K7M-4QX")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const confirm = page.getByRole("button", {
      name: locale === "ar" ? "تأكيد الاستلام" : "Confirmer le retrait",
    });
    expect((await confirm.boundingBox())?.height).toBeGreaterThanOrEqual(56);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`courier-${locale}-${String(width)}-${scheme}.png`),
      fullPage: true,
    });
  });
}
