import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  loadFavourites,
  loadOrderHistory,
  loadReceipt,
  reorder,
  setFavourite,
} from "../src/retention/orders-http";
import { orderMockIds as ids, ordersHandlers, ordersMockState } from "./mocks/orders-handlers";

const server = setupServer();
let state = ordersMockState();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  state = ordersMockState();
  server.resetHandlers(...ordersHandlers(state));
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://app.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

test("[CUS-21] lists past orders newest first with status, code and total", async () => {
  const page = await loadOrderHistory({});
  expect(page).toMatchObject({
    kind: "ready",
    nextCursor: null,
    orders: [{ shortCode: "K7Q2", status: "delivered", totalDzd: 2350 }, { status: "cancelled" }],
  });
});

test("[CUS-21] loads a receipt whose totals add up and rejects another order's receipt", async () => {
  const result = await loadReceipt(ids.orderId);
  expect(result).toMatchObject({
    kind: "ready",
    receipt: { subtotalDzd: 2150, deliveryFeeDzd: 200, totalDzd: 2350 },
  });
  expect(await loadReceipt(ids.oldOrderId)).toEqual({ kind: "not-found" });
});

test("[CUS-21] reorder returns a draft with unavailable items and changed prices for the same restaurant", async () => {
  expect(
    await reorder({ orderId: ids.orderId, merchantId: ids.merchantId, key: "k" }),
  ).toMatchObject({
    kind: "ready",
    reorder: { unavailable: [ids.soldOutItemId], priceChanges: [{ oldDzd: 1500, newDzd: 1600 }] },
  });
  expect(
    await reorder({ orderId: ids.orderId, merchantId: ids.otherMerchantId, key: "k" }),
  ).toEqual({ kind: "error" });
});

test("[CUS-23] adds and removes favourites idempotently", async () => {
  expect(await loadFavourites()).toMatchObject({
    kind: "ready",
    restaurants: [{ name: "Dar El Couscous", isOpen: true }],
  });
  expect(await setFavourite(ids.otherMerchantId, true)).toEqual({ kind: "saved" });
  expect(await setFavourite(ids.otherMerchantId, true)).toEqual({ kind: "saved" });
  expect(await setFavourite(ids.merchantId, false)).toEqual({ kind: "saved" });
  expect(state.favourites).toEqual({ [ids.merchantId]: false, [ids.otherMerchantId]: true });
});
