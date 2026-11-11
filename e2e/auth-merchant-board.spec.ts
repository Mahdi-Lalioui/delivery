import { expect, test, type Page } from "@playwright/test";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const orderId = "01932f18-3150-7c33-8a7a-53acfd343002";

async function mockBoard(page: Page, canHandover = false) {
  let accepted = false;
  let handedOver = false;
  const now = new Date();
  const base = {
    merchantId,
    orderId,
    status: "pending_acceptance",
    fulfilment: "pickup",
    shortCode: "K7M-4QX",
    version: 1,
    placedAt: now.toISOString(),
    scheduledFor: null,
    acceptanceDeadlineAt: new Date(now.getTime() + 360_000).toISOString(),
    eta: null,
    totalDzd: 1380,
    changeDzd: 620,
    confirmByPhone: false,
    canHandover: false,
    lines: [
      {
        itemId: orderId,
        quantity: 2,
        names: { fr: "Couscous aux légumes", ar: "كسكس بالخضار" },
        options: [],
        note: "",
      },
      {
        itemId: merchantId,
        quantity: 1,
        names: { fr: "Bourek maison", ar: "بوراك الدار" },
        options: [{ fr: "Fromage", ar: "جبن" }],
        note: "",
      },
    ],
  };
  const order = () => ({
    ...base,
    status: accepted ? "accepted" : base.status,
    version: accepted ? 2 : 1,
  });
  await page.route(`**/v1/merchants/${merchantId}/order-board*`, async (route) => {
    const snapshot = {
      orders: [
        order(),
        {
          ...base,
          orderId: merchantId,
          status: "ready",
          version: 3,
          shortCode: "G8N-2RY",
          fulfilment: "delivery",
          totalDzd: 1950,
          changeDzd: 50,
          canHandover,
        },
      ],
      events: [],
      cursor: accepted ? "3" : "2",
      hasMore: false,
    };
    if (handedOver) snapshot.orders.pop();
    await route.fulfill({ json: snapshot });
  });
  await page.route(`**/v1/orders/${orderId}/accept`, async (route) => {
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 1, prepMinutes: 20 });
    accepted = true;
    const { lines, changeDzd, confirmByPhone, canHandover: pickupHandover, ...summary } = order();
    expect(lines.length + changeDzd).toBeGreaterThan(0);
    expect(confirmByPhone).toBe(false);
    expect(pickupHandover).toBe(false);
    await route.fulfill({ json: summary });
  });
  await page.route(`**/v1/orders/${merchantId}/pick-up`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 3 });
    handedOver = true;
    await route.fulfill({
      json: {
        merchantId,
        orderId: merchantId,
        status: "out_for_delivery",
        fulfilment: "delivery",
        shortCode: "G8N-2RY",
        version: 4,
        placedAt: base.placedAt,
        scheduledFor: null,
        acceptanceDeadlineAt: base.acceptanceDeadlineAt,
        eta: null,
        totalDzd: 1950,
      },
    });
  });
}

test("[MER-03][MER-04] merchant accepts a ticket and it moves to preparing", async ({ page }) => {
  await mockBoard(page);
  await page.goto(`/fr/merchant/${merchantId}/board`);
  await expect(page.getByRole("heading", { name: "Commandes en direct" })).toBeVisible();
  await expect(page.getByText("K7M-4QX")).toBeVisible();
  await page.getByRole("button", { name: "Accepter", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "En préparation" }).getByText("K7M-4QX"),
  ).toBeVisible();
});

for (const { locale, width, scheme } of [
  { locale: "ar", width: 390, scheme: "light" },
  { locale: "fr", width: 390, scheme: "light" },
  { locale: "fr", width: 1280, scheme: "light" },
  { locale: "fr", width: 1280, scheme: "dark" },
] as const) {
  test(`[MER-03] board layout ${locale} ${String(width)} ${scheme}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await mockBoard(page);
    await page.goto(`/${locale}/merchant/${merchantId}/board`);
    await expect(page.getByText("K7M-4QX")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(errors).toEqual([]);
    await page.screenshot({
      path: info.outputPath("board.png"),
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("[MER-03] keeps visible tickets and disables actions while the board is offline", async ({
  page,
}) => {
  await mockBoard(page);
  await page.goto(`/fr/merchant/${merchantId}/board`);
  await expect(page.getByText("K7M-4QX")).toBeVisible();
  const url = `**/v1/merchants/${merchantId}/order-board*`;
  const fail = (route: Parameters<Parameters<typeof page.route>[1]>[0]) =>
    route.fulfill({ status: 503 });
  await page.route(url, fail);
  await expect(page.getByText("Hors ligne. Dernier tableau chargé.")).toBeVisible();
  await expect(page.getByText("K7M-4QX")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accepter", exact: true })).toBeDisabled();
  const replay = page.waitForRequest((request) => request.url().includes("/order-board?after=2"));
  await page.unroute(url, fail);
  await replay;
  await expect(page.getByRole("button", { name: "Accepter", exact: true })).toBeEnabled({
    timeout: 10_000,
  });
});

test("[MER-03] hands a ready delivery to its assigned courier", async ({ page }) => {
  await mockBoard(page, true);
  await page.goto(`/fr/merchant/${merchantId}/board`);
  await expect(page.getByText("G8N-2RY")).toBeVisible();
  await page.getByRole("button", { name: "Remettre au livreur" }).click();
  await expect(page.getByText("G8N-2RY")).toHaveCount(0);
});
