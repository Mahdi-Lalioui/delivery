import type { createPushSubscriptionRepository } from "@zaafran/db/push-subscriptions";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const endpoint = "https://fcm.googleapis.com/fcm/send/fixture";
const payload = { endpoint, keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) } };
const url = "/v1/me/push-subscriptions";

test("[NOT-04:http] only the active session can manage its own push endpoint", async () => {
  type Repo = ReturnType<typeof createPushSubscriptionRepository>;
  const save = vi
    .fn<Repo["save"]>()
    .mockResolvedValueOnce("saved")
    .mockResolvedValueOnce("subscription_in_use");
  const remove = vi.fn<Repo["remove"]>().mockResolvedValue("removed");
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId }),
    pushSubscriptions: { save, remove },
  });
  onTestFinished(() => api.close());
  const request = { method: "POST", url, payload } as const;
  expect(
    (await api.inject({ ...request, payload: { ...payload, endpoint: "https://127.0.0.1/push" } }))
      .statusCode,
  ).toBe(400);
  const saved = await api.inject(request);
  expect(saved.statusCode).toBe(204);
  expect(saved.headers["cache-control"]).toBe("no-store");
  expect(save).toHaveBeenCalledExactlyOnceWith({ userId: accountId, sessionId }, payload);
  const inUse = await api.inject(request);
  expect(inUse.statusCode).toBe(409);
  expect(inUse.json()).toMatchObject({ code: "subscription_in_use" });
  expect((await api.inject({ method: "DELETE", url, payload: { endpoint } })).statusCode).toBe(204);
  expect(remove).toHaveBeenCalledWith({ userId: accountId, sessionId }, endpoint);
});

test("[NOT-04:http] exposes only the public application server key", async () => {
  const publicKey = "B" + "A".repeat(86);
  const api = createApi({ checkReadiness: () => Promise.resolve(), pushPublicKey: publicKey });
  onTestFinished(() => api.close());
  const response = await api.inject("/v1/push/public-key");
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ publicKey });
});
