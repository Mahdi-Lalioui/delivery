import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const orderId = "01932f18-3150-7c33-8a7a-53acfd343001";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343002";
const now = new Date("2026-11-11T12:00:00Z");

test("[ORD-03:http] orders read and actions are scoped to the session", async () => {
  const read = vi
    .fn<ReturnType<typeof createOrderRepository>["read"]>()
    .mockResolvedValue(undefined);
  const apply = vi
    .fn<ReturnType<typeof createOrderRepository>["apply"]>()
    .mockResolvedValueOnce({ kind: "not_found" })
    .mockResolvedValueOnce({ kind: "order_conflict" })
    .mockResolvedValueOnce({ kind: "invalid_order_command" });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () =>
      Promise.resolve({ role: "merchant_owner", accountId, sessionId: accountId }),
    orderActions: { repository: { read, apply }, now: () => now },
  });
  onTestFinished(() => api.close());
  const url = `/v1/orders/${orderId}`;
  const identity = { orderId, accountId, role: "merchant_owner" };
  expect((await api.inject(url)).statusCode).toBe(404);
  expect(read).toHaveBeenCalledWith(identity);
  const request = {
    method: "POST",
    url: url + "/accept",
    payload: { expectedVersion: 1, prepMinutes: 15 },
    headers: { "idempotency-key": "order-accept" },
  } as const;
  expect(
    (await api.inject({ ...request, payload: { ...request.payload, accountId } })).statusCode,
  ).toBe(400);
  expect((await api.inject(request)).statusCode).toBe(404);
  expect(apply).toHaveBeenCalledWith({
    ...identity,
    action: { kind: "accept", prepMinutes: 15 },
    expectedVersion: 1,
    idempotencyKey: "order-accept",
    now,
  });
  const conflict = await api.inject(request);
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toMatchObject({ code: "order_conflict" });
  const assigned = await api.inject({
    ...request,
    url: url + "/assign",
    payload: { expectedVersion: 3, courierId: accountId.toUpperCase() },
    headers: { "idempotency-key": "order-assign" },
  });
  expect(assigned.statusCode).toBe(400);
  expect(apply).toHaveBeenLastCalledWith({
    ...identity,
    expectedVersion: 3,
    idempotencyKey: "order-assign",
    now,
    action: { kind: "assignCourier", courierId: accountId },
  });
});

test("[COU-05:http] delivery checks the assigned actor and reports a locked code", async () => {
  const apply = vi
    .fn<ReturnType<typeof createOrderRepository>["apply"]>()
    .mockResolvedValue({ kind: "delivery_code_locked" });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "courier", accountId, sessionId: accountId }),
    orderActions: { repository: { read: () => Promise.resolve(undefined), apply }, now: () => now },
  });
  onTestFinished(() => api.close());
  const response = await api.inject({
    method: "POST",
    url: "/v1/orders/" + orderId + "/deliver",
    payload: { expectedVersion: 5, proof: { kind: "code", code: "0123" } },
    headers: { "idempotency-key": "delivery-proof" },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({ code: "delivery_code_locked" });
  expect(apply).toHaveBeenCalledWith({
    orderId,
    accountId,
    role: "courier",
    expectedVersion: 5,
    now,
    idempotencyKey: "delivery-proof",
    action: { kind: "deliver", code: "0123" },
  });
});
