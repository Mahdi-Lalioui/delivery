import { afterEach, expect, test, vi } from "vitest";
import {
  applyBulkPrices,
  previewBulkPrices,
  undoBulkPrices,
  type BulkPriceSelection,
} from "../src/menu-price/bulk-price-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const itemId = "019d6abc-1234-7234-8234-123456789002";
const batchId = "019d6abc-1234-7234-8234-123456789003";
const otherId = "019d6abc-1234-7234-8234-123456789004";
const endpoint = `/v1/merchants/${merchantId}/menu/prices`;
const signal = new AbortController().signal;
const selection = {
  itemIds: [itemId],
  adjustment: { kind: "percent", basisPoints: 1_000 },
  roundingUnit: 10,
} satisfies BulkPriceSelection;
const raised = { itemId, oldPriceDzd: 500, newPriceDzd: 550 };
const restored = { itemId, oldPriceDzd: 550, newPriceDzd: 500 };
const privateRequest = { cache: "no-store", credentials: "same-origin", redirect: "error" };

function problem(status: number, code: string) {
  return Response.json(
    { type: "about:blank", title: "Conflict", status, code, requestId: "request-1" },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

afterEach(() => vi.unstubAllGlobals());

test("[MER-11] previews the selection without sending any price", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ sessionId, revision: 4, items: [raised] }));
  vi.stubGlobal("fetch", fetch);
  await expect(previewBulkPrices({ merchantId, selection, signal })).resolves.toEqual({
    kind: "ready",
    data: { sessionId, revision: 4, items: [raised] },
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(endpoint + "/preview", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
    ...privateRequest,
  });
});

test("[MER-11] refuses a preview that omits or adds an item", async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      sessionId,
      revision: 4,
      items: [{ ...raised, itemId: otherId }],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(previewBulkPrices({ merchantId, selection, signal })).resolves.toEqual({
    kind: "error",
  });
});

test("[MER-11] applies the selection as a session-bound idempotent command", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ batchId, revision: 5, items: [raised] }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    applyBulkPrices({
      merchantId,
      sessionId,
      idempotencyKey: "key-1",
      input: { ...selection, expectedRevision: 4 },
    }),
  ).resolves.toEqual({ kind: "saved", data: { batchId, revision: 5, items: [raised] } });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(endpoint + "/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "key-1",
      "x-expected-session-id": sessionId,
    },
    body: JSON.stringify({ ...selection, expectedRevision: 4 }),
    ...privateRequest,
  });
});

test("[MER-11] undoes a batch and checks the server echoed the same batch", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ batchId, revision: 6, items: [restored] }))
    .mockResolvedValueOnce(Response.json({ batchId: otherId, revision: 6, items: [restored] }));
  vi.stubGlobal("fetch", fetch);
  const request = { merchantId, sessionId, idempotencyKey: "key-2", batchId, expectedRevision: 5 };
  await expect(undoBulkPrices(request)).resolves.toEqual({
    kind: "saved",
    data: { batchId, revision: 6, items: [restored] },
  });
  expect(fetch).toHaveBeenNthCalledWith(1, `${endpoint}/batches/${batchId}/undo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "key-2",
      "x-expected-session-id": sessionId,
    },
    body: JSON.stringify({ expectedRevision: 5 }),
    ...privateRequest,
  });
  await expect(undoBulkPrices(request)).resolves.toEqual({ kind: "error", shouldReuseKey: true });
});

test.each([
  [problem(409, "undo_window_expired"), { kind: "undo-expired" }],
  [problem(409, "price_changed_since_apply"), { kind: "price-changed" }],
  [problem(409, "price_change_already_undone"), { kind: "already-undone" }],
  [problem(409, "revision_conflict"), { kind: "revision-conflict" }],
  [problem(409, "session_changed"), { kind: "session-changed" }],
  [problem(400, "invalid_bulk_price_change"), { kind: "invalid-change" }],
  [problem(401, "unauthorized"), { kind: "sign-in" }],
  [problem(404, "not_found"), { kind: "forbidden" }],
  [problem(429, "rate_limited"), { kind: "rate-limited", shouldReuseKey: true }],
  [problem(500, "internal_error"), { kind: "error", shouldReuseKey: true }],
] as const)("[MER-11] classifies a rejected undo as %#", async (response, expected) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(
    undoBulkPrices({ merchantId, sessionId, idempotencyKey: "k", batchId, expectedRevision: 5 }),
  ).resolves.toEqual(expected);
});

test("[MER-11] keeps the retry key after a network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(
    applyBulkPrices({
      merchantId,
      sessionId,
      idempotencyKey: "key-3",
      input: { ...selection, expectedRevision: 4 },
    }),
  ).resolves.toEqual({ kind: "error", shouldReuseKey: true });
});
