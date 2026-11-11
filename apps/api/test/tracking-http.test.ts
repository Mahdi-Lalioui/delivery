import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const orderId = "01932f18-3150-7c33-8a7a-53acfd343001";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const placedAt = "2026-11-11T10:00:00.000Z";

test("[CUS-18:http] private tracking binds the buyer to the signed-in account", async () => {
  const snapshot = {
    fulfilment: "pickup",
    order: {
      orderId,
      merchantId,
      placedAt,
      shortCode: "ABC-234",
      totalDzd: 1137,
      status: "ready",
      fulfilment: "pickup",
      version: 3,
      scheduledFor: null,
      acceptanceDeadlineAt: null,
      eta: null,
    },
    timeline: [{ status: "ready", at: placedAt }],
    restaurantPhone: null,
    shareToken: null,
    pickupCode: "ABC-234",
    pickupPin: { latitude: 36.75, longitude: 3.0625 },
  } as const;
  const tracking = vi
    .fn<ReturnType<typeof createOrderRepository>["tracking"]>()
    .mockResolvedValueOnce({ ...snapshot, timeline: [...snapshot.timeline] })
    .mockResolvedValueOnce(undefined);
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId: accountId }),
    orderTracking: tracking,
  });
  onTestFinished(() => api.close());
  const url = "/v1/orders/" + orderId + "/tracking";
  const response = await api.inject(url);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.json()).toEqual(snapshot);
  expect(tracking).toHaveBeenCalledWith({ orderId, customerId: accountId, sessionId: accountId });
  expect((await api.inject(url)).statusCode).toBe(404);
});
