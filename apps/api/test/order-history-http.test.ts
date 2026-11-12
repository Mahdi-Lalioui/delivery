import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const customerId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const orderId = "01932f18-3150-7c33-8a7a-53acfd343003";

test("[CUS-21:http] uses only the active customer for private history and receipts", async () => {
  const history = vi.fn<ReturnType<typeof createOrderRepository>["history"]>();
  const receipt = vi.fn<ReturnType<typeof createOrderRepository>["receipt"]>();
  history.mockResolvedValueOnce({ orders: [], nextCursor: null }).mockResolvedValueOnce(undefined);
  receipt.mockResolvedValue(undefined);
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId: customerId, sessionId }),
    orderHistory: { history, receipt, reorder: vi.fn() },
  });
  onTestFinished(() => api.close());
  const first = await api.inject("/v1/me/orders?limit=20");
  expect(first.statusCode).toBe(200);
  expect(first.json()).toEqual({ orders: [], nextCursor: null });
  expect(first.headers["cache-control"]).toBe("no-store");
  expect(history).toHaveBeenCalledExactlyOnceWith({ customerId, sessionId, query: { limit: 20 } });
  expect((await api.inject("/v1/me/orders?cursor=malformed")).statusCode).toBe(400);
  expect((await api.inject(`/v1/me/orders?customerId=${orderId}`)).statusCode).toBe(400);
  expect((await api.inject("/v1/me/orders")).statusCode).toBe(401);
  const missing = await api.inject(`/v1/me/orders/${orderId}/receipt`);
  expect(missing.statusCode).toBe(404);
  expect(missing.headers["cache-control"]).toBe("no-store");
  expect(receipt).toHaveBeenCalledExactlyOnceWith({ customerId, sessionId, orderId });
});

test("[CUS-21:http] returns a private current-menu reorder draft only for the session customer", async () => {
  const history = vi.fn<ReturnType<typeof createOrderRepository>["history"]>();
  const receipt = vi.fn<ReturnType<typeof createOrderRepository>["receipt"]>();
  const now = new Date("2026-11-12T12:00:00.000Z");
  const draft = {
    draft: { merchantId: orderId, restaurantSlug: "cuisine-awid", menuRevision: 3, items: [] },
    unavailable: [],
    priceChanges: [],
  };
  const reorder = vi
    .fn<ReturnType<typeof createOrderRepository>["reorder"]>()
    .mockResolvedValueOnce(draft)
    .mockResolvedValueOnce(undefined);
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId: customerId, sessionId }),
    orderHistory: { history, receipt, reorder },
    orderHistoryClock: () => now,
  });
  onTestFinished(() => api.close());
  const options = { method: "POST", url: `/v1/me/orders/${orderId}/reorder` } as const;
  const response = await api.inject(options);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.json()).toEqual(draft);
  expect(reorder).toHaveBeenCalledExactlyOnceWith({
    customerId,
    sessionId,
    orderId,
    now,
  });
  expect((await api.inject(options)).statusCode).toBe(404);
  expect(
    (await api.inject({ ...options, url: "/v1/me/orders/malformed/reorder" })).statusCode,
  ).toBe(400);
});
