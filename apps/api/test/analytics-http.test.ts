import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";

test("[MER-21:http] bounds the dates and passes the authenticated merchant scope", async () => {
  const merchantAnalytics = vi.fn<ReturnType<typeof createOrderRepository>["merchantAnalytics"]>();
  merchantAnalytics.mockResolvedValue(undefined);
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "merchant_owner", accountId, sessionId }),
    analytics: {
      repository: { merchantAnalytics, adminDashboard: vi.fn() },
      now: () => new Date(),
    },
  });
  onTestFinished(() => api.close());
  const path = `/v1/merchants/${merchantId}/analytics`;
  expect((await api.inject(path + "?from=2020-01-01&to=2026-11-12")).statusCode).toBe(400);
  expect(merchantAnalytics).not.toHaveBeenCalled();
  const result = await api.inject(path + "?from=2026-11-11&to=2026-11-12");
  expect(result.statusCode).toBe(404);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(merchantAnalytics).toHaveBeenCalledExactlyOnceWith({
    accountId,
    sessionId,
    merchantId,
    from: "2026-11-11",
    to: "2026-11-12",
  });
});
