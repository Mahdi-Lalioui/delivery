import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { publicFeedOutput } from "../packages/contracts/src/feed.ts";
import {
  customerOrderHistoryOutput,
  customerReorderOutput,
} from "../packages/contracts/src/retention.ts";
import { orderSummary } from "../packages/contracts/src/orders.ts";
import { orderRatingOutput } from "../packages/contracts/src/ratings.ts";
import { customerTrackingOutput } from "../packages/contracts/src/tracking.ts";
import { formatDzd } from "../packages/i18n/src/formats.ts";
import fr from "../packages/i18n/src/messages/fr.json" with { type: "json" };
import { withAuthHarness } from "./auth-fixture.ts";
import { authenticate, sessionCommand } from "./auth-session-helpers.ts";

const customerPhone = "+213550000341";
const ownerPhone = "+213550000342";
const courierPhone = "+213550000343";
const merchant = fr.merchantBoard;
const checkout = fr.checkout;
const tracking = fr.tracking;
type Journey = Awaited<ReturnType<AuthHarness["seedOrderJourney"]>>;
type Order = ReturnType<typeof orderSummary.parse>;

async function place(
  page: Page,
  harness: AuthHarness,
  { fixture, fulfilment }: { fixture: Journey; fulfilment: "pickup" | "delivery" },
) {
  if (fulfilment === "delivery") {
    const address = await page.request.post(harness.origin + "/v1/me/addresses", {
      headers: sessionCommand(harness.origin),
      data: {
        label: "Maison test",
        pin: fixture.commune.pin,
        landmark: "Repère fictif",
        isDefault: true,
      },
    });
    expect(address.status()).toBe(201);
  }
  await page.goto(harness.origin + "/fr/restaurants/" + fixture.slug);
  await page.getByRole("button", { name: "Choisir · Chawarma poulet" }).click();
  const item = page.getByRole("dialog");
  await item.getByRole("radio", { name: /Sauce blanche/u }).check();
  await item.getByRole("button", { name: /^Ajouter/u }).click();
  await page.getByRole("button", { name: "Voir le panier" }).click();
  await page.getByRole("link", { name: "Passer la commande" }).click();
  const option = fulfilment === "pickup" ? checkout.pickup : checkout.delivery;
  await page.locator(".ui-segment-face").filter({ hasText: option }).click();
  await expect(page.getByRole("radio", { name: option, exact: true })).toBeChecked();
  if (fulfilment === "delivery") await page.getByRole("radio", { name: "Maison test" }).check();
  const next = page.getByRole("button", { name: checkout.continue, exact: true });
  await next.click();
  await next.click();
  const due = fulfilment === "delivery" ? 687 : 550;
  const cash = page.getByRole("textbox", { name: checkout.payingWith });
  await cash.fill("1000");
  await expect(
    page.getByText(checkout.change.replace("{amount}", formatDzd(1000 - due, "fr"))),
  ).toBeVisible();
  const submit = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/v1/orders",
  );
  await page
    .getByRole("button", { name: checkout.place.replace("{total}", formatDzd(due, "fr")) })
    .click();
  const response = await submit;
  expect(response.status()).toBe(201);
  const order = orderSummary.parse(await response.json());
  expect(order).toMatchObject({ fulfilment, status: "pending_acceptance", totalDzd: due });
  await expect(page.getByRole("heading", { name: checkout.confirmedTitle })).toBeVisible();
  await expect(page.getByRole("img", { name: checkout.confirmedTitle })).toBeVisible();
  await expect(
    page.getByText(checkout.confirmedCode.replace("{code}", order.shortCode)),
  ).toBeVisible();
  await expect(page).toHaveURL(harness.origin + "/fr/orders/" + order.orderId);
  return order;
}

async function customerStatus(page: Page, status: string) {
  await expect(page.getByRole("heading", { name: status, exact: true })).toBeVisible();
}

function ticket(page: Page, order: Order) {
  return page.locator(".board-ticket").filter({ hasText: order.shortCode });
}

async function rate(page: Page, order: Order) {
  await page.getByRole("link", { name: tracking.rate }).click();
  const rating = fr.retentionRatings;
  await page.getByRole("group", { name: rating.food }).locator(".star-field-star").last().click();
  const delivery = page.getByRole("group", { name: rating.delivery });
  if (order.fulfilment === "delivery") await delivery.locator(".star-field-star").last().click();
  else await expect(delivery).toHaveCount(0);
  await page.getByRole("textbox", { name: rating.comment }).fill("Repas de test");
  const request = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().endsWith("/rating"),
  );
  await page.getByRole("button", { name: rating.submit }).click();
  const saved = await request;
  expect(saved.status()).toBe(200);
  expect(orderRatingOutput.parse(await saved.json())).toMatchObject({
    orderId: order.orderId,
    foodStars: 5,
    deliveryStars: order.fulfilment === "delivery" ? 5 : null,
  });
  await page.reload();
  await expect(
    page.getByRole("group", { name: rating.food }).getByRole("radio").last(),
  ).toBeChecked();
}

async function verifyScheduledPickup(page: Page, harness: AuthHarness, fixture: Journey) {
  const when = new Date(Date.now() + 60 * 60_000).toISOString();
  const url = new URL("/v1/feed", harness.origin);
  url.searchParams.set("fulfilment", "pickup");
  url.searchParams.set("availableAt", when);
  const response = await page.request.get(url.href);
  expect(response.status()).toBe(200);
  expect(publicFeedOutput.parse(await response.json()).restaurants).toMatchObject([
    { merchantId: fixture.merchantId, offersPickup: true, pin: fixture.commune.pin },
  ]);
}

async function reconnectBoard(board: Page, context: BrowserContext, order: Order) {
  await expect(ticket(board, order)).toHaveCount(0);
  const stream = board.waitForResponse(
    (response) =>
      response.url().includes("/v1/realtime?topic=merchantOrders") &&
      response.ok() &&
      response.headers()["content-type"]?.startsWith("text/event-stream") === true,
    { timeout: 20_000 },
  );
  await context.setOffline(false);
  await stream;
  await expect(board.getByText(merchant.offline)).toHaveCount(0, { timeout: 20_000 });
}

async function placeWithBoardRecovery({
  page,
  board,
  context,
  harness,
  fixture,
  flow,
}: {
  page: Page;
  board: Page;
  context: BrowserContext;
  harness: AuthHarness;
  fixture: Journey;
  flow: string;
}) {
  const fulfilment = flow === "delivery" ? "delivery" : "pickup";
  if (fulfilment === "delivery") {
    await context.setOffline(true);
    await expect(board.getByText(merchant.offline)).toBeVisible({ timeout: 20_000 });
  }
  const order = await place(page, harness, { fixture, fulfilment });
  if (fulfilment === "delivery") await reconnectBoard(board, context, order);
  return order;
}

test.describe.configure({ mode: "parallel" });

for (const flow of ["delivery", "pickup", "reject", "expire", "cancel"] as const) {
  test(`[ORD-01:browser] real cash order · ${flow}`, async ({ browser, baseURL, page }) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await withAuthHarness(
      baseURL,
      async (harness) => {
        const ownerContext = await browser.newContext({ ignoreHTTPSErrors: true });
        const courierContext = await browser.newContext({ ignoreHTTPSErrors: true });
        try {
          await authenticate(page.request, harness, { phone: customerPhone });
          await authenticate(ownerContext.request, harness, { phone: ownerPhone });
          if (flow === "delivery")
            await authenticate(courierContext.request, harness, { phone: courierPhone });
          const fixture = await harness.seedOrderJourney({
            ownerPhone,
            ...(flow === "delivery" ? { courierPhone } : {}),
            timeoutSeconds: flow === "expire" ? 15 : 480,
          });
          const board = await ownerContext.newPage();
          board.setDefaultTimeout(10_000);
          await board.goto(`${harness.origin}/fr/merchant/${fixture.merchantId}/board`);
          await expect(board.getByText(merchant.emptyNew)).toBeVisible();
          const order = await placeWithBoardRecovery({
            page,
            board,
            context: ownerContext,
            harness,
            fixture,
            flow,
          });
          await expect(ticket(board, order)).toBeVisible();
          if (flow === "reject") {
            const orderTicket = ticket(board, order);
            await orderTicket.getByText(merchant.reject, { exact: true }).click();
            await orderTicket.getByRole("button", { name: merchant.tooBusy }).click();
            await orderTicket.getByRole("button", { name: merchant.rejectSubmit }).click();
            await customerStatus(page, tracking.status_rejected);
          } else if (flow === "cancel") {
            await page.getByRole("button", { name: tracking.cancel, exact: true }).click();
            await page.getByRole("button", { name: tracking.reason_changed_mind }).click();
            await customerStatus(page, tracking.status_cancelled);
          } else if (flow === "expire") {
            await expect(
              page.getByRole("heading", { name: tracking.status_expired, exact: true }),
            ).toBeVisible({ timeout: 30_000 });
          } else {
            await ticket(board, order)
              .getByRole("button", { name: merchant.accept, exact: true })
              .click();
            await customerStatus(page, tracking.status_accepted);
            await ticket(board, order).getByRole("button", { name: merchant.markReady }).click();
            await customerStatus(page, tracking.status_ready);
            if (flow === "pickup") {
              await verifyScheduledPickup(page, harness, fixture);
              await expect(page.getByText(tracking.pickupCodeHint)).toBeVisible();
              await ticket(board, order).getByRole("button", { name: merchant.collect }).click();
              await customerStatus(page, tracking.status_collected);
            } else {
              await deliver({
                customer: page,
                board,
                context: courierContext,
                harness,
                fixture,
                order,
              });
              await customerStatus(page, tracking.status_delivered);
            }
            await rate(page, order);
            await page.goto(harness.origin + "/fr/orders");
            const card = page.locator(".orders-card").filter({ hasText: order.shortCode });
            await card.getByRole("button", { name: fr.retentionOrders.receipt }).click();
            await expect(card.getByText("Chawarma poulet", { exact: false })).toBeVisible();
            if (flow === "pickup") {
              const response = await page.request.get(harness.origin + "/v1/me/orders");
              expect(response.status()).toBe(200);
              expect(
                customerOrderHistoryOutput.parse(await response.json()).orders[0],
              ).toMatchObject({
                orderId: order.orderId,
                restaurantSlug: fixture.slug,
              });
              const request = page.waitForResponse(
                (result) =>
                  result.request().method() === "POST" && result.url().endsWith("/reorder"),
              );
              await card.getByRole("button", { name: fr.retentionOrders.orderAgain }).click();
              const reorder = await request;
              expect(reorder.status()).toBe(200);
              expect(customerReorderOutput.parse(await reorder.json())).toMatchObject({
                draft: {
                  merchantId: fixture.merchantId,
                  restaurantSlug: fixture.slug,
                  menuRevision: expect.any(Number),
                  items: [{ quantity: 1, optionIds: [expect.any(String)] }],
                },
                unavailable: [],
                priceChanges: [],
              });
              await expect(page.getByText(fr.retentionOrders.reorderSame)).toBeVisible();
              await page.getByRole("button", { name: fr.retentionOrders.continueToCart }).click();
              await expect(page).toHaveURL(harness.origin + "/fr/restaurants/" + fixture.slug);
              await page.getByRole("button", { name: "Voir le panier" }).click();
              const cart = page.getByRole("dialog");
              await expect(cart.getByText("Chawarma poulet", { exact: true })).toBeVisible();
              await expect(cart.getByText(/Sauce blanche/u)).toBeVisible();
            }
          }
          await expect(ticket(board, order)).toHaveCount(0);
        } finally {
          await courierContext.close();
          await ownerContext.close();
        }
      },
      true,
    );
  });
}

async function deliver({
  customer,
  board,
  context,
  harness,
  fixture,
  order,
}: {
  customer: Page;
  board: Page;
  context: BrowserContext;
  harness: AuthHarness;
  fixture: Journey;
  order: Order;
}) {
  const current = ticket(board, order);
  await current.getByText(merchant.assignCourier, { exact: true }).click();
  await current.getByRole("button", { name: "Nassim" }).click();
  await context.grantPermissions(["geolocation"], { origin: harness.origin });
  await context.setGeolocation({ ...fixture.commune.pin, accuracy: 10 });
  const courier = await context.newPage();
  courier.setDefaultTimeout(10_000);
  await courier.goto(harness.origin + "/fr/courier");
  const copy = fr.courier;
  const pickup = courier.getByRole("button", { name: copy.confirmPickup });
  await expect(pickup).toBeEnabled();
  await context.setOffline(true);
  await expect(courier.getByText(copy.connectionLost)).toBeVisible({ timeout: 20_000 });
  await expect(pickup).toBeDisabled();
  await context.setOffline(false);
  await expect(pickup).toBeEnabled({ timeout: 20_000 });
  await pickup.press("Enter");
  await customerStatus(customer, tracking.status_out_for_delivery);
  harness.advanceClock(60_000);
  await courier.getByText(copy.gpsShare, { exact: true }).click();
  await expect(courier.getByText(copy.gpsLive, { exact: true })).toBeVisible({ timeout: 12_000 });
  const view = await customer.request.get(
    harness.origin + "/v1/orders/" + order.orderId + "/tracking",
  );
  const result = customerTrackingOutput.parse(await view.json());
  expect(result.fulfilment).toBe("delivery");
  if (result.fulfilment !== "delivery" || !result.deliveryCode)
    throw new Error("Missing live delivery code");
  expect(result.courier?.position).toMatchObject(fixture.commune.pin);
  await expect(customer.getByText(result.deliveryCode, { exact: true })).toBeVisible();
  await courier.getByRole("textbox", { name: copy.deliveryCode }).fill(result.deliveryCode);
  await courier.getByRole("button", { name: copy.confirmDropoff }).press("Enter");
  await expect(courier.getByText(copy.deliveryComplete, { exact: true })).toBeVisible();
}
