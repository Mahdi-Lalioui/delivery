import { expect, test } from "vitest";
import {
  adminMerchantNoticeOutput,
  adminMerchantReviewInput,
  adminMerchantReviewOutput,
  adminReviewQueueQuery,
  adminReviewQueueOutput,
  readAdminReviewCursor,
} from "../src/admin.ts";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const reviewedAt = "2026-11-07T12:00:00.000Z";

test.each(["approve", "reject"])(
  "[ADM-03:contract] decision %s requires a trimmed reason",
  (decision) => {
    expect(adminMerchantReviewInput.parse({ decision, reason: " Verified application " })).toEqual({
      decision,
      reason: "Verified application",
    });
    const reason = "x".repeat(500);
    expect(adminMerchantReviewInput.parse({ decision, reason: ` ${reason} ` })).toEqual({
      decision,
      reason,
    });
    for (const invalid of [undefined, "", " \t\n ", "x".repeat(501), "x\0y", 42]) {
      expect(adminMerchantReviewInput.safeParse({ decision, reason: invalid }).success).toBe(false);
    }
  },
);

test("[ADM-03:contract] permits only review decisions and rejects injected review metadata", () => {
  const body = { decision: "approve", reason: "Verified application" };
  for (const invalid of [
    { decision: "suspend" },
    { decision: "approved" },
    { reviewerId: merchantId },
    { merchantId },
    { reviewedAt },
    { status: "approved" },
  ]) {
    expect(adminMerchantReviewInput.safeParse({ ...body, ...invalid }).success).toBe(false);
  }
});

test.each(["approved", "rejected"])(
  "[ADM-03:contract] reports %s and the UTC review timestamp",
  (status) => {
    const output = { merchantId, status, reviewedAt };
    expect(adminMerchantReviewOutput.parse(output)).toEqual(output);
    for (const invalid of [
      { merchantId: "not-a-uuid" },
      { status: "pending_review" },
      { status: "active" },
      { reviewedAt: "later" },
      { reviewedAt: "2026-11-07T13:00:00+01:00" },
      { reviewerId: merchantId },
    ]) {
      expect(adminMerchantReviewOutput.safeParse({ ...output, ...invalid }).success).toBe(false);
    }
  },
);

test("[ADM-03:contract] bounds the review queue and validates its cursor", () => {
  const cursor = reviewedAt + "~" + merchantId;
  expect(adminReviewQueueQuery.parse({})).toEqual({ limit: 50 });
  expect(adminReviewQueueQuery.parse({ limit: "1", cursor })).toEqual({ limit: 1, cursor });
  expect(readAdminReviewCursor(cursor)).toEqual({ submittedAt: reviewedAt, merchantId });
  for (const query of [
    { limit: "101" },
    { cursor: "yesterday~" + merchantId },
    { cursor: reviewedAt + "~wrong-id" },
    { cursor: cursor + "~extra" },
  ])
    expect(adminReviewQueueQuery.safeParse(query).success).toBe(false);
});

test("[ADM-03:contract] exposes pending applications without account secrets", () => {
  const application = {
    merchantId,
    restaurantName: "Table fictive",
    ownerName: "Test propriétaire",
    phoneE164: "+213500000001",
    commune: { id: merchantId, nameAr: "بلدية تجريبية", nameFr: "Commune de test" },
    pin: { latitude: 36.75, longitude: 3.06 },
    cuisines: ["algerian"],
    rcNumber: null,
    submittedAt: reviewedAt,
  };
  const payload = { sessionId: merchantId, applications: [application], nextCursor: null };
  expect(adminReviewQueueOutput.safeParse({ applications: [], nextCursor: null }).success).toBe(
    false,
  );
  expect(adminReviewQueueOutput.parse(payload)).toEqual(payload);
  expect(
    adminReviewQueueOutput.safeParse({
      ...payload,
      applications: [{ ...application, sessionToken: "fixture" }],
    }).success,
  ).toBe(false);
});

test("[MER-01:notice] counts pending applications and identifies the latest without personal data", () => {
  const empty = { sessionId: merchantId, pendingCount: 0, latestMerchantId: null };
  const pending = { sessionId: merchantId, pendingCount: 2, latestMerchantId: merchantId };
  expect(adminMerchantNoticeOutput.parse(empty)).toEqual(empty);
  expect(adminMerchantNoticeOutput.parse(pending)).toEqual(pending);
  for (const invalid of [
    { ...empty, latestMerchantId: merchantId },
    { ...pending, latestMerchantId: null },
    { ...pending, pendingCount: -1 },
    { ...pending, pendingCount: 1.5 },
    { ...pending, sessionId: "no-session" },
    { ...pending, latestMerchantId: "no-merchant" },
    { ...pending, phoneE164: "+213500000001" },
  ]) {
    expect(adminMerchantNoticeOutput.safeParse(invalid).success).toBe(false);
  }
});
