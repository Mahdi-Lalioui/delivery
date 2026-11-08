import { afterEach, expect, test, vi } from "vitest";
import {
  listHeldMenuItems,
  prepareHeldItemReview,
  reviewHeldMenuItem,
} from "../src/admin/admin-moderation-http";

const itemId = "019d6abc-1234-7234-8234-123456789abc";
const merchantId = "019d6abc-1234-7234-8234-123456789def";
const sessionId = "019d6abc-1234-7234-8234-123456789aaa";
const otherSessionId = "019d6abc-1234-7234-8234-123456789bbb";
const endpoint = "/v1/admin/menu-items";
const held = {
  itemId,
  merchantId,
  restaurantName: "Table fictive",
  names: { fr: "Bière pression" },
  descriptions: { fr: "Pression fictive" },
  matches: ["alcohol"],
};

afterEach(() => vi.unstubAllGlobals());

function respondWith(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function problem(status: number, code: string) {
  const body = { type: "about:blank", title: "Problem", status, code, requestId: "request-1" };
  return Response.json(body, { status, headers: { "content-type": "application/problem+json" } });
}

test("[ADM-04:web] reads the held page with the same-origin session only", async () => {
  const signal = new AbortController().signal;
  const page = { sessionId, items: [held], nextCursor: itemId };
  const fetch = respondWith(Response.json(page));

  await expect(
    listHeldMenuItems({ cursor: merchantId, expectedSessionId: sessionId, signal }),
  ).resolves.toEqual({ kind: "ready", page });
  const query = new URLSearchParams({ limit: "20", cursor: merchantId });
  expect(fetch).toHaveBeenCalledWith(`${endpoint}/held?${query.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test("[ADM-04:web] refuses another session's page, a repeated cursor and a malformed page", async () => {
  respondWith(Response.json({ sessionId: otherSessionId, items: [held], nextCursor: null }));
  await expect(
    listHeldMenuItems({ cursor: merchantId, expectedSessionId: sessionId }),
  ).resolves.toEqual({ kind: "session-changed" });

  respondWith(Response.json({ sessionId, items: [held], nextCursor: merchantId }));
  await expect(
    listHeldMenuItems({ cursor: merchantId, expectedSessionId: sessionId }),
  ).resolves.toEqual({ kind: "error" });

  respondWith(
    Response.json({ sessionId, items: [{ ...held, matches: ["wine"] }], nextCursor: null }),
  );
  await expect(listHeldMenuItems({})).resolves.toEqual({ kind: "error" });
});

test.each([401, 403])("[ADM-04:web] asks to sign in when the queue returns %i", async (status) => {
  respondWith(new Response(null, { status }));
  await expect(listHeldMenuItems({})).resolves.toEqual({ kind: "sign-in" });
});

test("[ADM-04:web] keeps one idempotency key for an identical retry only", () => {
  const request: Parameters<typeof prepareHeldItemReview>[0] = {
    itemId,
    expectedSessionId: sessionId,
    decision: "reject",
    reason: " Alcool ",
  };
  const first = prepareHeldItemReview(request);
  if (first.kind !== "ready") throw new Error("Expected a valid review.");
  expect(first.attempt.input).toEqual({ decision: "reject", reason: "Alcool" });
  expect(prepareHeldItemReview({ ...request, previous: first.attempt })).toEqual(first);
  const changed = prepareHeldItemReview({ ...request, reason: "Tabac", previous: first.attempt });
  expect(changed.kind === "ready" && changed.attempt.key).not.toBe(first.attempt.key);
  expect(prepareHeldItemReview({ ...request, reason: " " })).toEqual({
    kind: "invalid",
    field: "reason",
  });
  expect(prepareHeldItemReview({ ...request, decision: "" })).toEqual({
    kind: "invalid",
    field: "decision",
  });
});

test("[ADM-04:web] sends the review with its key and session and checks the echoed result", async () => {
  const attempt = {
    itemId,
    expectedSessionId: sessionId,
    input: { decision: "approve", reason: "Sans alcool" },
    key: "key-1",
  } as const;
  const result = {
    itemId,
    merchantId,
    moderationStatus: "approved",
    reviewedAt: "2026-11-08T12:00:00.000Z",
  };
  const fetch = respondWith(Response.json(result));

  await expect(reviewHeldMenuItem(attempt)).resolves.toEqual({ kind: "approved" });
  expect(fetch).toHaveBeenCalledWith(`${endpoint}/${itemId}/review`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "key-1",
      "X-Expected-Session-Id": sessionId,
    },
    body: JSON.stringify(attempt.input),
  });

  respondWith(Response.json({ ...result, moderationStatus: "rejected" }));
  await expect(reviewHeldMenuItem(attempt)).resolves.toEqual({ kind: "error" });
});

test.each([
  [problem(401, "unauthenticated"), "sign-in"],
  [problem(403, "forbidden"), "sign-in"],
  [problem(404, "not_found"), "stale"],
  [problem(409, "invalid_status"), "stale"],
  [problem(409, "session_changed"), "session-changed"],
  [problem(409, "idempotency_conflict"), "error"],
  [problem(429, "rate_limited"), "error"],
] as const)("[ADM-04:web] maps a failed review to %#", async (response, kind) => {
  respondWith(response);
  const attempt = {
    itemId,
    expectedSessionId: sessionId,
    input: { decision: "reject", reason: "Alcool" },
    key: "key-2",
  } as const;
  await expect(reviewHeldMenuItem(attempt)).resolves.toEqual({ kind });
});
