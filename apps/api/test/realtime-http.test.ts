import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343003";
const noOrder = {
  replayOrder: () => Promise.resolve(undefined),
  subscribeOrder: () => () => undefined,
};
const url = "/v1/realtime?topic=merchantOrders&merchantId=" + merchantId;

test("[RT-02:http] resumes at Last-Event-ID, emits ordered events and closes after access is revoked", async () => {
  const event = {
    id: "6",
    orderId: merchantId,
    version: 2,
    status: "accepted",
    at: "2026-11-11T12:00:00Z",
  } as const;
  const replay = vi
    .fn<ReturnType<typeof createOrderRepository>["merchantReplay"]>()
    .mockResolvedValueOnce({ cursor: "6", events: [event], hasMore: false })
    .mockResolvedValueOnce(undefined);
  const unsubscribe = vi.fn();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "merchant_owner", accountId, sessionId }),
    realtime: {
      ...noOrder,
      replay,
      subscribe(_merchant, wake) {
        wake();
        return unsubscribe;
      },
    },
  });
  onTestFinished(() => api.close());
  const response = await api.inject({ url: url + "&after=1", headers: { "last-event-id": "5" } });
  expect(response.statusCode).toBe(200);
  expect(response.headers["content-type"]).toContain("text/event-stream");
  expect(response.headers["cache-control"]).toBe("no-store, no-transform");
  expect(response.body).toContain("id: 6\nevent: order\ndata: " + JSON.stringify(event) + "\n\n");
  expect(replay).toHaveBeenNthCalledWith(1, { accountId, sessionId, merchantId, after: "5" });
  expect(replay).toHaveBeenNthCalledWith(2, { accountId, sessionId, merchantId, after: "6" });
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("[RT-01:http] returns 404 for a merchant outside the session scope and rejects oversized cursors", async () => {
  const replay = vi
    .fn<ReturnType<typeof createOrderRepository>["merchantReplay"]>()
    .mockResolvedValue(undefined);
  const unsubscribe = vi.fn();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "merchant_manager", accountId, sessionId }),
    realtime: { ...noOrder, replay, subscribe: () => unsubscribe },
  });
  onTestFinished(() => api.close());
  expect(
    (await api.inject({ url, headers: { "last-event-id": "9223372036854775808" } })).statusCode,
  ).toBe(400);
  expect((await api.inject(url)).statusCode).toBe(404);
  expect(replay).toHaveBeenCalledExactlyOnceWith({
    accountId,
    sessionId,
    merchantId,
    after: undefined,
  });
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("[CUS-18:http] customer can subscribe to an owned order but cannot open the merchant topic", async () => {
  const orderId = merchantId;
  const event = {
    id: "2",
    orderId,
    version: 2,
    status: "accepted",
    at: "2026-11-11T12:00:00Z",
  } as const;
  const replayOrder = vi
    .fn<ReturnType<typeof createOrderRepository>["orderReplay"]>()
    .mockResolvedValueOnce({ cursor: "2", events: [event], hasMore: false })
    .mockResolvedValueOnce(undefined);
  const replay = vi.fn<ReturnType<typeof createOrderRepository>["merchantReplay"]>();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId }),
    realtime: {
      replay,
      replayOrder,
      subscribe: () => () => undefined,
      subscribeOrder(_orderId, wake) {
        wake();
        return () => undefined;
      },
    },
  });
  onTestFinished(() => api.close());
  expect((await api.inject(url)).statusCode).toBe(403);
  expect(replay).not.toHaveBeenCalled();
  const response = await api.inject("/v1/realtime?topic=order&orderId=" + orderId + "&after=1");
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("id: 2\nevent: order\ndata: " + JSON.stringify(event));
  expect(replayOrder).toHaveBeenNthCalledWith(1, {
    orderId,
    accountId,
    sessionId,
    role: "customer",
    after: "1",
  });
});
