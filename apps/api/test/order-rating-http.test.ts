import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const customerId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const orderId = "01932f18-3150-7c33-8a7a-53acfd343003";
const now = new Date("2026-11-11T12:00:00Z");
const path = `/v1/orders/${orderId}/rating`;

test("[CUS-22:http] requires the session and key, and distinguishes unrated orders from inaccessible ones", async () => {
  const rating = vi.fn<ReturnType<typeof createOrderRepository>["rating"]>();
  const rate = vi.fn<ReturnType<typeof createOrderRepository>["rate"]>();
  rating.mockResolvedValueOnce({ kind: "unrated" }).mockResolvedValueOnce({ kind: "not_found" });
  rate
    .mockResolvedValueOnce({ kind: "not_eligible" })
    .mockResolvedValueOnce({ kind: "invalid_stars" });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId: customerId, sessionId }),
    orderRatings: { repository: { rating, rate }, now: () => now },
  });
  onTestFinished(() => api.close());
  const unrated = await api.inject(path);
  expect(unrated.statusCode).toBe(204);
  expect(unrated.headers["cache-control"]).toBe("no-store");
  expect(unrated.payload).toBe("");
  expect((await api.inject(path)).statusCode).toBe(404);
  const request = { method: "PUT", url: path, payload: { foodStars: 5 } } as const;
  expect((await api.inject(request)).statusCode).toBe(400);
  const keyed = { ...request, headers: { "idempotency-key": "rating-test" } };
  const notEligible = await api.inject(keyed);
  expect(notEligible.statusCode).toBe(409);
  expect(notEligible.json()).toMatchObject({ code: "not_eligible" });
  expect(rate).toHaveBeenCalledExactlyOnceWith({
    customerId,
    sessionId,
    orderId,
    now,
    idempotencyKey: "rating-test",
    input: { foodStars: 5 },
  });
  expect((await api.inject(keyed)).statusCode).toBe(400);
});
