import { expect, test } from "vitest";
import {
  merchantReviewPageOutput,
  merchantReviewPageQuery,
  merchantReviewReplyInput,
  merchantReviewReplyOutput,
  merchantReviewReportInput,
  merchantReviewReportOutput,
  orderRatingInput,
  orderRatingOutput,
  publicReviewPageOutput,
  publicReviewPageQuery,
  readReviewCursor,
} from "../src/ratings.ts";

const ratingId = "01932f18-3150-7c33-8a7a-53acfd343101";
const orderId = "01932f18-3150-7c33-8a7a-53acfd343201";
const createdAt = "2026-11-08T12:00:00.000Z";
const editableUntil = "2026-11-09T12:00:00.000Z";
const cursor = `${createdAt}~${ratingId}`;
const reply = { body: "Merci pour votre avis", createdAt };
const pickupReview = { ratingId, foodStars: 5, deliveryStars: null, comment: null, createdAt };

test("[CUS-22:contract] accepts food-only and two-score ratings on submission and edit", () => {
  expect(orderRatingInput.parse({ foodStars: 1 })).toEqual({ foodStars: 1 });
  const comment = "ب".repeat(500);
  expect(
    orderRatingInput.parse({ foodStars: 5, deliveryStars: 1, comment: ` ${comment} ` }),
  ).toEqual({
    foodStars: 5,
    deliveryStars: 1,
    comment,
  });

  for (const invalid of [
    { deliveryStars: 5 },
    { foodStars: "5" },
    { foodStars: 0 },
    { foodStars: 6 },
    { foodStars: 2.5 },
    { foodStars: 5, deliveryStars: 0 },
    { foodStars: 5, deliveryStars: 6 },
    { foodStars: 5, deliveryStars: 2.5 },
    { foodStars: 5, comment: `${comment}ب` },
    { foodStars: 5, comment: "bon\0jour" },
    { foodStars: 5, comment: "bon\uD800jour" },
  ]) {
    expect(orderRatingInput.safeParse(invalid).success).toBe(false);
  }
});

test("[CUS-22:contract] rating writes reject client claims about the order and edit window", () => {
  for (const claim of [
    { orderId },
    { customerId: orderId },
    { merchantId: orderId },
    { fulfilment: "pickup" },
    { completedAt: createdAt },
    { createdAt },
    { editableUntil },
  ]) {
    expect(orderRatingInput.safeParse({ foodStars: 5, ...claim }).success).toBe(false);
  }
  const rating = { ...pickupReview, orderId, editableUntil, reply };
  expect(orderRatingOutput.parse(rating)).toEqual(rating);
  expect(orderRatingOutput.safeParse({ ...rating, editableUntil: "tomorrow" }).success).toBe(false);
});

test("[CUS-22:contract] public reviews use a bounded creation-time keyset", () => {
  expect(publicReviewPageQuery.parse({})).toEqual({ limit: 50 });
  expect(publicReviewPageQuery.parse({ cursor, limit: "100" })).toEqual({ cursor, limit: 100 });
  expect(readReviewCursor(cursor)).toEqual({ createdAt, ratingId });
  for (const invalid of [
    { cursor: "" },
    { cursor: `yesterday~${ratingId}` },
    { cursor: `${createdAt}~not-a-uuid` },
    { cursor: `${cursor}~extra` },
    { limit: "0" },
    { limit: "101" },
    { limit: "1.0" },
    { stars: "5" },
  ]) {
    expect(publicReviewPageQuery.safeParse(invalid).success).toBe(false);
  }
});

test("[CUS-22:contract] public pages show replies without exposing private review fields", () => {
  const deliveryReview = { ...pickupReview, deliveryStars: 4, comment: "Merci", reply };
  const page = { reviews: [deliveryReview, { ...pickupReview, reply: null }], nextCursor: cursor };
  expect(publicReviewPageOutput.parse(page)).toEqual(page);
  expect(publicReviewPageOutput.parse({ reviews: [], nextCursor: null })).toEqual({
    reviews: [],
    nextCursor: null,
  });
  for (const extra of [
    { orderId },
    { customerId: orderId },
    { editableUntil },
    { reply: { ...reply, editableUntil } },
    { reply: [reply, reply] },
  ]) {
    expect(
      publicReviewPageOutput.safeParse({ ...page, reviews: [{ ...deliveryReview, ...extra }] })
        .success,
    ).toBe(false);
  }
  expect(publicReviewPageOutput.safeParse({ ...page, nextCursor: "not-a-cursor" }).success).toBe(
    false,
  );
  expect(
    publicReviewPageOutput.safeParse({
      ...page,
      reviews: Array.from({ length: 101 }, () => deliveryReview),
    }).success,
  ).toBe(false);
});

test("[MER-20:contract] merchant review pages filter by an exact food star score", () => {
  expect(merchantReviewPageQuery.parse({})).toEqual({ limit: 50 });
  expect(merchantReviewPageQuery.parse({ cursor, limit: "10", stars: "5" })).toEqual({
    cursor,
    limit: 10,
    stars: 5,
  });
  for (const stars of ["0", "6", "4.5", " 5", "05", "5e0"]) {
    expect(merchantReviewPageQuery.safeParse({ stars }).success).toBe(false);
  }
  expect(merchantReviewPageQuery.safeParse({ merchantId: orderId }).success).toBe(false);

  const page = {
    reviews: [
      { ...pickupReview, reply: { ...reply, editableUntil } },
      { ...pickupReview, reply: null },
    ],
    nextCursor: null,
  };
  expect(merchantReviewPageOutput.parse(page)).toEqual(page);
  expect(
    merchantReviewPageOutput.safeParse({ ...page, reviews: [{ ...pickupReview, reply }] }).success,
  ).toBe(false);
});

test("[MER-20:contract] merchants send one reply body and receive its edit deadline", () => {
  expect(merchantReviewReplyInput.parse({ body: ` ${reply.body} ` })).toEqual({ body: reply.body });
  for (const invalid of [
    { body: " " },
    { body: "a".repeat(501) },
    { body: ["first", "second"] },
    { body: reply.body, ratingId },
    { body: reply.body, editableUntil },
  ]) {
    expect(merchantReviewReplyInput.safeParse(invalid).success).toBe(false);
  }
  const result = { ratingId, reply: { ...reply, editableUntil } };
  expect(merchantReviewReplyOutput.parse(result)).toEqual(result);
  expect(merchantReviewReplyOutput.safeParse({ ratingId, reply }).success).toBe(false);
});

test("[MER-20:contract] merchants report abuse with a non-blank reason", () => {
  expect(merchantReviewReportInput.parse({ reason: " Harcèlement " })).toEqual({
    reason: "Harcèlement",
  });
  for (const invalid of [
    { reason: " " },
    { reason: "a".repeat(501) },
    { reason: "harcèlement\0" },
    { reason: "Harcèlement", merchantId: orderId },
    { reason: "Harcèlement", ratingId },
  ]) {
    expect(merchantReviewReportInput.safeParse(invalid).success).toBe(false);
  }
  expect(merchantReviewReportOutput.parse({ ratingId, reportedAt: createdAt })).toEqual({
    ratingId,
    reportedAt: createdAt,
  });
  expect(merchantReviewReportOutput.safeParse({ ratingId, reportedAt: "today" }).success).toBe(
    false,
  );
});
