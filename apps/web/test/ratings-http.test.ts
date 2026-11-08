import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  isEditable,
  listMerchantReviews,
  loadOrderRating,
  replyToReview,
  reportReview,
  saveOrderRating,
} from "../src/retention/ratings-http";
import { ratingMockIds as ids, ratingsHandlers, ratingsMockState } from "./mocks/ratings-handlers";

const server = setupServer();
let state = ratingsMockState();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  state = ratingsMockState();
  server.resetHandlers(...ratingsHandlers(state));
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://app.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

const key = "019d6abc-0000-7000-8000-0000000001ff";

test("[CUS-22] submits food, delivery and comment, then loads the saved rating", async () => {
  expect(await loadOrderRating(ids.orderId)).toEqual({ kind: "ready", rating: null });
  const draft = { foodStars: 5, deliveryStars: 4, comment: "  Parfait  " };
  const saved = await saveOrderRating({ orderId: ids.orderId, draft, isDelivery: true, key });
  expect(saved).toMatchObject({
    kind: "saved",
    rating: { foodStars: 5, deliveryStars: 4, comment: "Parfait" },
  });
  expect(await loadOrderRating(ids.orderId)).toMatchObject({
    kind: "ready",
    rating: { foodStars: 5 },
  });
});

test("[CUS-22] requires delivery stars only for delivery orders and caps the comment", async () => {
  const draft = { foodStars: 4, deliveryStars: undefined, comment: "" };
  expect(await saveOrderRating({ orderId: ids.orderId, draft, isDelivery: true, key })).toEqual({
    kind: "invalid",
    field: "deliveryStars",
  });
  const pickup = await saveOrderRating({
    orderId: ids.pickupOrderId,
    draft,
    isDelivery: false,
    key,
  });
  expect(pickup).toMatchObject({ kind: "saved", rating: { deliveryStars: null, comment: null } });
  const long = { foodStars: 4, deliveryStars: 3, comment: "x".repeat(501) };
  expect(
    await saveOrderRating({ orderId: ids.orderId, draft: long, isDelivery: true, key }),
  ).toEqual({
    kind: "invalid",
    field: "comment",
  });
  const zero = { foodStars: 0, deliveryStars: 3, comment: "" };
  expect(
    await saveOrderRating({ orderId: ids.orderId, draft: zero, isDelivery: true, key }),
  ).toEqual({
    kind: "invalid",
    field: "foodStars",
  });
});

test("[CUS-22] reports a closed 24 h edit window", async () => {
  state.isWindowClosed = true;
  const draft = { foodStars: 3, deliveryStars: 3, comment: "" };
  expect(await saveOrderRating({ orderId: ids.orderId, draft, isDelivery: true, key })).toEqual({
    kind: "closed",
  });
  expect(isEditable("2027-02-09T20:00:00.000Z", Date.parse("2027-02-09T19:59:59.000Z"))).toBe(true);
  expect(isEditable("2027-02-09T20:00:00.000Z", Date.parse("2027-02-09T20:00:00.000Z"))).toBe(
    false,
  );
});

test("[MER-20] lists reviews filtered by stars and replies once", async () => {
  const all = await listMerchantReviews({ merchantId: ids.merchantId });
  expect(all.kind === "ready" && all.reviews).toHaveLength(2);
  const low = await listMerchantReviews({ merchantId: ids.merchantId, stars: 2 });
  expect(low.kind === "ready" && low.reviews.map((row) => row.ratingId)).toEqual([
    ids.otherRatingId,
  ]);
  expect(
    await replyToReview({
      merchantId: ids.merchantId,
      ratingId: ids.ratingId,
      body: "Merci !",
      key,
    }),
  ).toEqual({
    kind: "saved",
  });
  expect(state.reviews[0]?.reply?.body).toBe("Merci !");
  expect(
    await replyToReview({ merchantId: ids.merchantId, ratingId: ids.ratingId, body: " ", key }),
  ).toEqual({
    kind: "invalid",
  });
});

test("[MER-20] reports abuse to the admin and maps another merchant to not-found", async () => {
  const report = {
    merchantId: ids.merchantId,
    ratingId: ids.otherRatingId,
    reason: "Insultes",
    key,
  };
  expect(await reportReview(report)).toEqual({ kind: "saved" });
  expect(state.reports).toEqual([ids.otherRatingId]);
  expect(await listMerchantReviews({ merchantId: ids.orderId })).toEqual({ kind: "not-found" });
});
