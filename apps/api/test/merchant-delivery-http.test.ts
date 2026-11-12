import {
  merchantDeliverySettingsOutput,
  merchantDeliverySettingsWriteOutput,
} from "@zaafran/contracts/merchant-delivery";
import type { createMerchantDeliveryRepository } from "@zaafran/db/merchant-delivery";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

type Repository = ReturnType<typeof createMerchantDeliveryRepository>;
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343001";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const path = `/v1/merchants/${merchantId}/delivery-settings`;
const settings = {
  pickupEnabled: true,
  deliveryEnabled: true,
  pickupMinimumDzd: 250,
  prepMinutes: 20,
  zone: { radiusMeters: 4000, feeDzd: 200, minimumDzd: 500, travelMinutes: 15 },
};
const put = {
  method: "PUT",
  url: path,
  headers: { "idempotency-key": "fixture-delivery", "x-expected-session-id": sessionId },
  payload: { ...settings, expectedRevision: 1 },
} as const;

function setup() {
  const repository = { read: vi.fn<Repository["read"]>(), replace: vi.fn<Repository["replace"]>() };
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId }),
    merchantDelivery: { repository, now: () => new Date("2026-11-11T12:00:00.000Z") },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-17] serves a session-bound settings snapshot and idempotent write receipt", async () => {
  const { api, repository } = setup();
  repository.read.mockResolvedValue({ revision: 1, settings });
  repository.replace.mockResolvedValue({ kind: "replayed", revision: 2 });
  const get = await api.inject(path);
  const save = await api.inject(put);
  expect(get.statusCode).toBe(200);
  expect(get.headers["cache-control"]).toBe("no-store");
  expect(merchantDeliverySettingsOutput.parse(get.json())).toEqual({
    settings,
    revision: 1,
    sessionId,
  });
  expect(save.statusCode).toBe(200);
  expect(save.headers["cache-control"]).toBe("no-store");
  expect(merchantDeliverySettingsWriteOutput.parse(save.json())).toEqual({ revision: 2 });
  expect(repository.read).toHaveBeenCalledExactlyOnceWith({ merchantId, accountId });
  const [write] = repository.replace.mock.calls;
  expect(write?.[0]).toMatchObject({ merchantId, accountId, input: put.payload });
});

test("[MER-17] denies stale sessions, invalid delivery and cross-tenant reads", async () => {
  const { api, repository } = setup();
  const stale = { ...put, headers: { ...put.headers, "x-expected-session-id": accountId } };
  expect((await api.inject(stale)).statusCode).toBe(409);
  expect((await api.inject({ ...put, payload: { ...put.payload, zone: null } })).statusCode).toBe(
    400,
  );
  expect(repository.replace).not.toHaveBeenCalled();
  expect((await api.inject(path)).statusCode).toBe(404);
  repository.replace.mockResolvedValue({ kind: "not_found" });
  expect((await api.inject(put)).statusCode).toBe(404);
});
