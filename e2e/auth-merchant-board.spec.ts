import { expect, test, type Page } from "@playwright/test";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const orderId = "01932f18-3150-7c33-8a7a-53acfd343002";

async function mockBoard(page: Page, canHandover = false, addProof = false) {
  let accepted = false;
  let handedOver = false;
  let assignedCourier: string | undefined;
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
  await page.route("**/v1/realtime?*", (route) => route.fulfill({ status: 204 }));
  await page.route(`**/v1/merchants/${merchantId}/order-board*`, async (route) => {
    const snapshot = {
      orders: [
        order(),
        {
          ...base,
          orderId: merchantId,
          status: "ready",
          version: assignedCourier ? 4 : 3,
          shortCode: "G8N-2RY",
          fulfilment: "delivery",
          totalDzd: 1950,
          changeDzd: 50,
          canHandover: canHandover || Boolean(assignedCourier),
          courierId: assignedCourier ?? null,
        },
      ],
      events: [],
      cursor: accepted ? "3" : "2",
      ...(addProof
        ? {
            deliveryProofs: [
              {
                orderId,
                photoId: merchantId,
                shortCode: "C7X-5DW",
                reason: "Code indisponible",
                at: now.toISOString(),
              },
            ],
          }
        : {}),
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
  return {
    assign: (id: string) => {
      assignedCourier = id;
    },
  };
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

test("[RT-02] a streamed event immediately refreshes the board from its saved cursor", async ({
  page,
}) => {
  await mockBoard(page);
  const send = Promise.withResolvers<boolean>();
  await page.route("**/v1/realtime?*", async (route) => {
    await send.promise;
    await route.fulfill({
      contentType: "text/event-stream",
      body: "id: 3\nevent: order\ndata: {}\n\n",
    });
  });
  const connection = page.waitForRequest((request) => request.url().includes("/v1/realtime?"));
  await page.goto(`/fr/merchant/${merchantId}/board`);
  await expect(page.getByText("K7M-4QX")).toBeVisible();
  const request = await connection;
  expect(new URL(request.url()).searchParams.get("after")).toBe("2");
  const refresh = page.waitForRequest((request) => request.url().includes("/order-board?after=2"), {
    timeout: 2_500,
  });
  send.resolve(true);
  await refresh;
});

test("[COU-01][MER-03] owner creates a courier invitation and assigns the ready ticket", async ({
  page,
}) => {
  const courierId = "01932f18-3150-7c33-8a7a-53acfd343006";
  const inviteId = "01932f18-3150-7c33-8a7a-53acfd343007";
  const board = await mockBoard(page);
  await page.route("**/v1/me/merchants", (route) =>
    route.fulfill({
      json: {
        sessionId: inviteId,
        memberships: [
          { merchantId, restaurantName: "Table de la Casbah", status: "active", role: "owner" },
        ],
      },
    }),
  );
  await page.route(`**/v1/merchants/${merchantId}/couriers`, (route) =>
    route.fulfill({
      json: {
        couriers: [{ courierId, displayName: "Sami", online: true }],
      },
    }),
  );
  await page.route(`**/v1/merchants/${merchantId}/couriers/invites`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ phone: "+213500000007" });
    return route.fulfill({ status: 201, json: { inviteId, expiresAt: new Date().toISOString() } });
  });
  await page.route(`**/v1/orders/${merchantId}/assign`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ courierId, expectedVersion: 3 });
    board.assign(courierId);
    return route.fulfill({
      json: {
        orderId: merchantId,
        merchantId,
        status: "ready",
        version: 4,
        fulfilment: "delivery",
        shortCode: "G8N-2RY",
        totalDzd: 1950,
        placedAt: new Date().toISOString(),
        scheduledFor: null,
        acceptanceDeadlineAt: null,
        eta: null,
      },
    });
  });
  await page.goto(`/fr/merchant/${merchantId}/board`);
  await page.getByText("Équipe de livraison", { exact: true }).click();
  await page.getByLabel("Téléphone du livreur").fill("0500000007");
  await page.getByRole("button", { name: "Créer l’invitation" }).click();
  await expect(page.getByLabel("Lien d’invitation")).toHaveValue(
    new RegExp("/fr/courier#invite=" + inviteId, "u"),
  );
  await page.getByText("Assigner un livreur", { exact: true }).click();
  await page.getByRole("button", { name: "Sami" }).click();
  await expect(page.getByText("Changer de livreur", { exact: true })).toBeVisible();
});

test("[COU-05] flags a handover without code and opens the private evidence", async ({ page }) => {
  await mockBoard(page, false, true);
  const photo = `/v1/media/${merchantId}/variants/webp/640`;
  await page.route("**" + photo, (route) =>
    route.fulfill({
      path: "apps/web/public/pwa/icon-192.png",
      contentType: "image/png",
    }),
  );
  await page.goto(`/fr/merchant/${merchantId}/board`);
  await expect(page.getByRole("heading", { name: "Photos de remise à vérifier" })).toBeVisible();
  await page.getByText("C7X-5DW", { exact: true }).click();
  await expect(page.getByText("Code indisponible", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Photo de remise du colis" })).toHaveAttribute(
    "src",
    photo,
  );
});
