import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const quoteId = "01932f18-3150-7c33-8a7a-53acfd343002";
const now = new Date("2026-11-11T12:00:00Z");
const order = {
  orderId: quoteId,
  merchantId: quoteId,
  status: "pending_acceptance",
  fulfilment: "pickup",
  shortCode: "K7M-4QX",
  version: 1,
  placedAt: now.toISOString(),
  scheduledFor: null,
  acceptanceDeadlineAt: "2026-11-11T12:08:00.000Z",
  eta: null,
  totalDzd: 1000,
} as const;

test("[ORD-05:http] places orders with the session account and requires a key", async () => {
  const place = vi.fn<ReturnType<typeof createOrderRepository>["place"]>();
  place
    .mockResolvedValueOnce({ kind: "placed", order })
    .mockResolvedValueOnce({ kind: "quote_changed" });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId: quoteId }),
    orders: { repository: { place }, now: () => now },
  });
  onTestFinished(() => api.close());
  const request = { method: "POST", url: "/v1/orders", payload: { quoteId } } as const;
  const keyed = { ...request, headers: { "idempotency-key": "checkout-123" } };
  expect((await api.inject(request)).statusCode).toBe(400);
  expect(
    (await api.inject({ ...keyed, payload: { quoteId, customerId: quoteId } })).statusCode,
  ).toBe(400);
  const response = await api.inject(keyed);
  expect(response.statusCode).toBe(201);
  expect(response.json()).toEqual(order);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(place).toHaveBeenCalledExactlyOnceWith({
    customerId: accountId,
    input: { quoteId },
    now,
    idempotencyKey: "checkout-123",
  });
  const changed = await api.inject(keyed);
  expect(changed.statusCode).toBe(409);
  expect(changed.json()).toMatchObject({ code: "quote_changed" });
});
