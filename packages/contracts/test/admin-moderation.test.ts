import { expect, test } from "vitest";
import {
  adminItemQueueOutput,
  adminItemQueueQuery,
  adminItemReviewInput,
  adminItemReviewOutput,
} from "../src/admin-moderation.ts";

const itemId = "01932f18-3150-7c33-8a7a-53acfd343101";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343201";
const reviewedAt = "2026-11-08T12:00:00.000Z";

const queued = {
  itemId,
  merchantId,
  restaurantName: "Table fictive",
  names: { fr: "Bière pression", ar: "بيرة" },
  descriptions: { fr: "Pression fictive" },
  matches: ["alcohol"],
};

test("[ADM-04:contract] a review needs a decision and a trimmed reason, and nothing else", () => {
  expect(adminItemReviewInput.parse({ decision: "reject", reason: " Alcool " })).toEqual({
    decision: "reject",
    reason: "Alcool",
  });
  for (const invalid of [
    { decision: "approve" },
    { decision: "hide", reason: "x" },
    { decision: "approve", reason: " " },
    { decision: "approve", reason: "x", itemId },
    { decision: "approve", reason: "x", moderationStatus: "approved" },
  ]) {
    expect(adminItemReviewInput.safeParse(invalid).success).toBe(false);
  }
});

test("[ADM-04:contract] a review result is approved or rejected with its instant", () => {
  const result = { itemId, merchantId, moderationStatus: "approved", reviewedAt };
  expect(adminItemReviewOutput.parse(result)).toEqual(result);
  for (const moderationStatus of ["unreviewed", "blocked_pending_review"]) {
    expect(adminItemReviewOutput.safeParse({ ...result, moderationStatus }).success).toBe(false);
  }
});

test("[ADM-04:contract] the held-item queue pages by item id and lists unique matches", () => {
  expect(adminItemQueueQuery.parse({ limit: "20" })).toEqual({ limit: 20 });
  expect(adminItemQueueQuery.parse({ cursor: itemId, limit: "20" })).toEqual({
    cursor: itemId,
    limit: 20,
  });
  expect(adminItemQueueQuery.safeParse({ cursor: "not-an-id", limit: "20" }).success).toBe(false);

  const page = { sessionId, items: [queued, { ...queued, matches: [] }], nextCursor: itemId };
  expect(adminItemQueueOutput.parse(page)).toEqual(page);
  for (const matches of [["alcohol", "alcohol"], ["pharmacy"]]) {
    const invalid = { ...page, items: [{ ...queued, matches }] };
    expect(adminItemQueueOutput.safeParse(invalid).success).toBe(false);
  }
  const tooMany = { ...page, items: Array.from({ length: 101 }, () => queued) };
  expect(adminItemQueueOutput.safeParse(tooMany).success).toBe(false);
});

test("[ADM-04:contract] opts into a content-bound review token", () => {
  const token = "a".repeat(64);
  expect(adminItemQueueQuery.parse({ includeReviewToken: "1" })).toMatchObject({
    includeReviewToken: "1",
  });
  expect(
    adminItemReviewInput.parse({ decision: "approve", reason: "Verified", reviewToken: token }),
  ).toMatchObject({ reviewToken: token });
  expect(
    adminItemReviewInput.safeParse({ decision: "approve", reason: "Verified", reviewToken: "bad" })
      .success,
  ).toBe(false);
});
