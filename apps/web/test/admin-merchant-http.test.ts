import { afterEach, expect, test, vi } from "vitest";
import {
  listAdminMerchantApplications,
  prepareAdminReviewAttempt,
  reviewAdminMerchantApplication,
} from "../src/admin/admin-merchant-http";

const id = "019d6abc-1234-7234-8234-123456789abc";
const otherId = "019d6abc-1234-7234-8234-123456789def";
const sessionId = "019d6abc-1234-7234-8234-123456789aaa";
const otherSessionId = "019d6abc-1234-7234-8234-123456789bbb";
const submittedAt = "2026-11-07T12:00:00.000Z";
const cursor = submittedAt + "~" + id;
const endpoint = "/v1/admin/merchant-applications";
const application = {
  merchantId: id,
  restaurantName: "Cuisine de test",
  ownerName: "Équipe de test",
  phoneE164: "+213500000041",
  commune: { id: otherId, nameAr: "بلدية تجريبية", nameFr: "Commune fictive" },
  pin: { latitude: 36.75, longitude: 3 },
  cuisines: ["algerian"],
  rcNumber: null,
  submittedAt,
};

afterEach(() => vi.unstubAllGlobals());

test("[ADM-03:web] reads the pending page using only the secure same-origin session", async () => {
  const signal = new AbortController().signal;
  const previousCursor = "2026-11-07T11:00:00.000Z~" + otherId;
  const page = { applications: [application], nextCursor: cursor, sessionId };
  const fetch = vi.fn().mockResolvedValue(Response.json(page));
  vi.stubGlobal("fetch", fetch);

  await expect(
    listAdminMerchantApplications({ cursor: previousCursor, expectedSessionId: sessionId, signal }),
  ).resolves.toEqual({ kind: "ready", page });
  const query = new URLSearchParams({ limit: "20", cursor: previousCursor });
  expect(fetch).toHaveBeenCalledWith(endpoint + "?" + query.toString(), {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test("[ADM-03:web] refuses to append another session’s queue page even when it returns 200", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ applications: [application], nextCursor: null, sessionId: otherSessionId }),
      ),
  );

  await expect(
    listAdminMerchantApplications({ cursor, expectedSessionId: sessionId }),
  ).resolves.toEqual({
    kind: "session-changed",
  });
});

test.each([401, 403])("[ADM-03:web] blocks queue data when the API returns %i", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));

  await expect(listAdminMerchantApplications({})).resolves.toEqual({ kind: "sign-in" });
});

test("[ADM-03:web] rejects malformed application pages without rendering private fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ applications: [{ ...application, status: "active" }] })),
  );

  await expect(listAdminMerchantApplications({})).resolves.toEqual({ kind: "error" });
});

test("[ADM-03:web] requires a decision and a trimmed reason of at most 500 characters", () => {
  expect(
    prepareAdminReviewAttempt({
      merchantId: id,
      expectedSessionId: sessionId,
      decision: "reject",
      reason: " \n ",
    }),
  ).toEqual({
    kind: "invalid",
    field: "reason",
  });
  expect(
    prepareAdminReviewAttempt({
      merchantId: id,
      expectedSessionId: sessionId,
      decision: "approve",
      reason: "a".repeat(501),
    }),
  ).toEqual({ kind: "invalid", field: "reason" });
  expect(
    prepareAdminReviewAttempt({
      merchantId: id,
      expectedSessionId: sessionId,
      decision: "",
      reason: "Valid reason",
    }),
  ).toEqual({
    kind: "invalid",
    field: "decision",
  });
});

test("[ADM-03:web] retries the same normalized decision under the original idempotency key", () => {
  const request = {
    merchantId: id,
    expectedSessionId: sessionId,
    decision: "approve",
    reason: "Verified",
  } as const;
  const result = prepareAdminReviewAttempt(request);
  if (result.kind !== "ready") throw new Error("Expected a prepared review");

  expect(
    prepareAdminReviewAttempt({ ...request, reason: " Verified ", previous: result.attempt }),
  ).toEqual(result);
  for (const change of [
    { decision: "reject" },
    { reason: "Different" },
    { merchantId: otherId },
    { expectedSessionId: otherSessionId },
  ] as const) {
    const changed = prepareAdminReviewAttempt({ ...request, ...change, previous: result.attempt });
    if (changed.kind !== "ready") throw new Error("Expected a changed review");
    expect(changed.attempt.key).not.toBe(result.attempt.key);
  }
});

const attempt = {
  merchantId: id,
  expectedSessionId: sessionId,
  input: { decision: "reject", reason: "Verified" },
  key: id,
} as const;

test("[ADM-03:web] submits the explicit decision and validates the returned decision and merchant", async () => {
  const output = { merchantId: id, status: "rejected", reviewedAt: submittedAt };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(output))
    .mockResolvedValueOnce(Response.json({ ...output, status: "approved" }))
    .mockResolvedValueOnce(Response.json({ ...output, merchantId: otherId }));
  vi.stubGlobal("fetch", fetch);

  await expect(reviewAdminMerchantApplication(attempt)).resolves.toEqual({ kind: "rejected" });
  expect(fetch).toHaveBeenNthCalledWith(1, endpoint + "/" + id + "/review", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": id,
      "X-Expected-Session-Id": sessionId,
    },
    body: JSON.stringify(attempt.input),
  });
  await expect(reviewAdminMerchantApplication(attempt)).resolves.toEqual({ kind: "error" });
  await expect(reviewAdminMerchantApplication(attempt)).resolves.toEqual({ kind: "error" });
});

test.each([
  { status: 401, code: "unauthenticated", kind: "sign-in" },
  { status: 403, code: "forbidden", kind: "sign-in" },
  { status: 404, code: "not_found", kind: "stale" },
  { status: 409, code: "invalid_status", kind: "stale" },
  { status: 409, code: "session_changed", kind: "session-changed" },
  { status: 409, code: "idempotency_conflict", kind: "error" },
  { status: 503, code: "not_ready", kind: "error" },
])("[ADM-03:web] reports $code as $kind when saving", async ({ status, code, kind }) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { type: "about:blank", title: "Review error", status, code, requestId: "review-test" },
          { status },
        ),
      ),
  );
  await expect(reviewAdminMerchantApplication(attempt)).resolves.toEqual({ kind });
});
