import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";

test("[CUS-22][MER-20:http] public reviews use a slug and merchant reviews use the actor and star filter", async () => {
  const publicReviews = vi.fn<ReturnType<typeof createOrderRepository>["publicReviews"]>();
  const merchantReviews = vi.fn<ReturnType<typeof createOrderRepository>["merchantReviews"]>();
  publicReviews.mockResolvedValue({ reviews: [], nextCursor: null });
  merchantReviews.mockResolvedValue(undefined);
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "merchant_owner", accountId, sessionId }),
    reviews: { publicReviews, merchantReviews },
  });
  onTestFinished(() => api.close());
  const response = await api.inject("/v1/restaurants/sample/reviews?limit=5");
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ reviews: [], nextCursor: null });
  expect(publicReviews).toHaveBeenCalledExactlyOnceWith({ slug: "sample", limit: 5 });
  const missing = await api.inject(`/v1/merchants/${merchantId}/reviews?stars=4`);
  expect(missing.statusCode).toBe(404);
  expect(missing.headers["cache-control"]).toBe("no-store");
  expect(merchantReviews).toHaveBeenCalledExactlyOnceWith({
    merchantId,
    accountId,
    sessionId,
    stars: 4,
    limit: 50,
  });
});
