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

test("[MER-20:http] validates keyed review commands and preserves the edit-window conflict", async () => {
  const ratingId = "01932f18-3150-7c33-8a7a-53acfd343004";
  const now = new Date();
  const replyToReview = vi.fn<ReturnType<typeof createOrderRepository>["replyToReview"]>();
  const reportReview = vi.fn<ReturnType<typeof createOrderRepository>["reportReview"]>();
  replyToReview.mockResolvedValue({ kind: "edit_window_closed" });
  reportReview.mockResolvedValue({
    kind: "saved",
    output: { ratingId, reportedAt: now.toISOString() },
  });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "merchant_owner", accountId, sessionId }),
    reviewCommands: { repository: { replyToReview, reportReview }, now: () => now },
  });
  onTestFinished(() => api.close());
  const path = `/v1/merchants/${merchantId}/reviews/${ratingId}`;
  const command = { method: "PUT", url: path + "/reply", payload: { body: "Merci" } } as const;
  expect((await api.inject(command)).statusCode).toBe(400);
  const headers = { "idempotency-key": "review-command" };
  const closed = await api.inject({ ...command, headers });
  expect(closed.statusCode).toBe(409);
  expect(closed.json()).toMatchObject({ code: "edit_window_closed" });
  expect(replyToReview).toHaveBeenCalledExactlyOnceWith({
    ratingId,
    merchantId,
    accountId,
    sessionId,
    now,
    body: "Merci",
    idempotencyKey: "review-command",
  });
  const reported = await api.inject({
    method: "POST",
    url: path + "/report",
    headers,
    payload: { reason: "Test" },
  });
  expect(reported.statusCode).toBe(200);
  expect(reported.json()).toEqual({ ratingId, reportedAt: now.toISOString() });
});
