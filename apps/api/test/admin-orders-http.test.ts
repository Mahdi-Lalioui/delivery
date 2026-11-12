import { adminOrderDetailOutput, adminOrderSearchOutput } from "@zaafran/contracts/admin-orders";
import type { createAdminOrdersRepository } from "@zaafran/db/admin-orders";
import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

type Repository = ReturnType<typeof createAdminOrdersRepository>;
type Orders = ReturnType<typeof createOrderRepository>;
const orderId = "01932f18-3150-7c33-8a7a-53acfd343001";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343002";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343003";
const order = {
  orderId,
  merchantId: accountId,
  status: "accepted",
  shortCode: "AWD-2A2",
  fulfilment: "pickup",
  restaurantName: "Cuisine fictive",
  version: 2,
  placedAt: "2026-11-11T12:00:00Z",
  scheduledFor: null,
  acceptanceDeadlineAt: null,
  eta: null,
  totalDzd: 900,
} as const;
const search = { method: "POST", url: "/v1/admin/orders/search", payload: {} } as const;
const detail = "/v1/admin/orders/" + orderId + "/timeline";

function setup() {
  const repository = {
    search: vi.fn<Repository["search"]>(),
    detail: vi.fn<Repository["detail"]>(),
  };
  const apply = vi.fn<Orders["apply"]>();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "admin", sessionId, accountId }),
    adminOrders: repository,
    orderActions: {
      repository: { read: () => Promise.resolve(undefined), apply },
      now: () => new Date(order.placedAt),
    },
  });
  onTestFinished(() => api.close());
  return { api, repository, apply };
}

test("[ADM-05] keeps search and timeline private and validates the admin request body", async () => {
  const { api, repository } = setup();
  repository.search.mockResolvedValue({ orders: [order], nextCursor: null });
  repository.detail.mockResolvedValue({ order, events: [], hasEarlierEvents: false });
  const results = await api.inject(search);
  const history = await api.inject(detail);
  expect(results.statusCode).toBe(200);
  expect(results.headers["cache-control"]).toBe("no-store");
  expect(adminOrderSearchOutput.parse(results.json())).toEqual({
    orders: [order],
    nextCursor: null,
    sessionId,
  });
  expect(history.statusCode).toBe(200);
  expect(history.headers["cache-control"]).toBe("no-store");
  expect(adminOrderDetailOutput.parse(history.json())).toEqual({
    order,
    events: [],
    hasEarlierEvents: false,
    sessionId,
  });
  expect(repository.search).toHaveBeenCalledExactlyOnceWith({
    accountId,
    input: { scope: "live", limit: 20 },
  });
  expect(repository.detail).toHaveBeenCalledExactlyOnceWith({ accountId, orderId });
  const invalid = await api.inject({
    ...search,
    payload: { filter: { kind: "phone", phone: "0550000000" } },
  });
  expect(invalid.statusCode).toBe(400);
  expect(repository.search).toHaveBeenCalledOnce();
});

test("[ADM-05] refuses to force an order from a stale or missing admin session", async () => {
  const { api, apply } = setup();
  const request = {
    method: "POST",
    url: "/v1/orders/" + orderId + "/force",
    headers: { "idempotency-key": "fixture-force" },
    payload: { expectedVersion: 2, to: "cancelled", reason: "Support request" },
  } as const;
  expect((await api.inject(request)).statusCode).toBe(400);
  const stale = await api.inject({
    ...request,
    headers: { ...request.headers, "x-expected-session-id": accountId },
  });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "session_changed" });
  expect(apply).not.toHaveBeenCalled();
  apply.mockResolvedValue({ kind: "order_conflict" });
  expect(
    (
      await api.inject({
        ...request,
        headers: { ...request.headers, "x-expected-session-id": sessionId },
      })
    ).statusCode,
  ).toBe(409);
  expect(apply).toHaveBeenCalledOnce();
});
