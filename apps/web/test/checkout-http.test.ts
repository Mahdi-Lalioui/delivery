import type { Cart } from "@zaafran/domain/cart";
import { dzd, type Dzd } from "@zaafran/domain/money";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  loadAddresses,
  placeOrder,
  requestQuote,
  toQuoteInput,
} from "../src/checkout/checkout-http";

const merchantId = "00000000-0000-4000-8000-000000000010";
const itemId = "00000000-0000-4000-8000-000000000012";
const large = "00000000-0000-4000-8000-000000000103";
const cheese = "00000000-0000-4000-8000-000000000105";
const addressId = "00000000-0000-4000-8000-000000000301";
const quoteId = "00000000-0000-4000-8000-000000000401";
const orderId = "00000000-0000-4000-8000-000000000501";

function money(value: number): Dzd {
  const result = dzd(value);
  if (!result.ok) throw new Error("bad amount");
  return result.value;
}

const cart: Cart = {
  version: 1,
  merchant: { merchantId, name: "L’Atelier", minimumDzd: 0 },
  expiresAt: Date.parse("2026-11-20T00:00:00Z"),
  lines: [
    {
      lineId: "00000000-0000-4000-8000-000000000201",
      itemId,
      names: { fr: "Chawarma" },
      unitPriceDzd: money(650),
      quantity: 2,
      note: "Sans oignon",
      options: [large, cheese].map((optionId) => ({
        optionGroupId: "00000000-0000-4000-8000-000000000101",
        groupNames: { fr: "Taille" },
        optionId,
        names: { fr: "x" },
        priceDeltaDzd: money(0),
      })),
    },
  ],
};

const quote = {
  quoteId,
  fulfilment: "delivery",
  expiresAt: "2026-11-11T20:10:00.000Z",
  subtotalDzd: 1600,
  deliveryFeeDzd: 100,
  totalDzd: 1700,
};
const order = {
  orderId,
  merchantId,
  status: "pending_acceptance",
  fulfilment: "delivery",
  shortCode: "ABC-DEF",
  version: 1,
  placedAt: "2026-11-11T20:00:00.000Z",
  scheduledFor: null,
  acceptanceDeadlineAt: "2026-11-11T20:05:00.000Z",
  eta: null,
  totalDzd: 1700,
};

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  server.resetHandlers();
  const intercepted = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    intercepted(new URL(input, "http://customer.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

test("[CUS-13] maps the browser cart to a delivery quote request", () => {
  expect(toQuoteInput(cart, { fulfilment: "delivery", addressId }, { kind: "asap" })).toEqual({
    merchantId,
    fulfilment: "delivery",
    addressId,
    timing: { kind: "asap" },
    items: [{ itemId, quantity: 2, optionIds: [large, cheese], note: "Sans oignon" }],
  });
});

test("[CUS-13] pickup quotes carry no address and scheduled timing keeps its instant", () => {
  const scheduledFor = "2026-11-12T12:00:00+01:00";
  const input = toQuoteInput(cart, { fulfilment: "pickup" }, { kind: "scheduled", scheduledFor });
  expect(input).toMatchObject({
    fulfilment: "pickup",
    timing: { kind: "scheduled", scheduledFor },
  });
  expect(input).not.toHaveProperty("addressId");
});

test("[CUS-13] reads saved addresses and maps a missing session to sign-in", async () => {
  server.use(http.get("*/v1/me/addresses", () => HttpResponse.json({ addresses: [] })));
  expect(await loadAddresses()).toEqual({ kind: "ready", addresses: [] });
  server.use(http.get("*/v1/me/addresses", () => new HttpResponse(null, { status: 401 })));
  expect(await loadAddresses()).toEqual({ kind: "sign-in" });
});

test("[CUS-14] returns the server quote and rejects a quote whose total does not add up", async () => {
  const input = toQuoteInput(cart, { fulfilment: "delivery", addressId }, { kind: "asap" });
  server.use(http.post("*/v1/quotes", () => HttpResponse.json(quote, { status: 201 })));
  expect(await requestQuote(input)).toEqual({ kind: "ready", quote });
  server.use(
    http.post("*/v1/quotes", () => HttpResponse.json({ ...quote, totalDzd: 1 }, { status: 201 })),
  );
  expect(await requestQuote(input)).toEqual({ kind: "error" });
  server.use(http.post("*/v1/quotes", () => new HttpResponse(null, { status: 422 })));
  expect(await requestQuote(input)).toEqual({ kind: "unavailable" });
});

test("[ORD-01] places the order once with the idempotency key and maps an expired quote", async () => {
  const keys: (string | null)[] = [];
  server.use(
    http.post("*/v1/orders", ({ request }) => {
      keys.push(request.headers.get("Idempotency-Key"));
      return HttpResponse.json(order, { status: 201 });
    }),
  );
  const key = "6b0c1a6e-4b0e-4b8b-8a43-111111111111";
  expect(await placeOrder({ quoteId, payingWithDzd: 2000 }, key)).toEqual({
    kind: "placed",
    order,
  });
  await placeOrder({ quoteId }, key);
  expect(keys).toEqual([key, key]);
  server.use(http.post("*/v1/orders", () => new HttpResponse(null, { status: 409 })));
  expect(await placeOrder({ quoteId }, key)).toEqual({ kind: "expired" });
});
