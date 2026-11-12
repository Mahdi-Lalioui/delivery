import { afterEach, expect, test, vi } from "vitest";
import { readBoard, submitBoardAction } from "../src/merchant-board/board-http";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";

afterEach(() => vi.unstubAllGlobals());

test("[RT-02:web] requests the last cursor and preserves the board replay payload", async () => {
  const snapshot = { orders: [], events: [], cursor: "13", hasMore: false };
  const fetch = vi.fn().mockResolvedValue(Response.json(snapshot));
  vi.stubGlobal("fetch", fetch);
  expect(
    await readBoard({ merchantId, after: "12", signal: new AbortController().signal }),
  ).toEqual({ kind: "ready", data: snapshot });
  expect(fetch).toHaveBeenCalledWith(
    `/v1/merchants/${merchantId}/order-board?after=12`,
    expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
  );
});

test("[ORD-04:web] sends the same idempotency key and version and surfaces conflicts", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  expect(
    await submitBoardAction({
      orderId: merchantId,
      key: "retry-1",
      expectedVersion: 4,
      action: { kind: "ready" },
    }),
  ).toBe("conflict");
  expect(fetch).toHaveBeenCalledWith(
    `/v1/orders/${merchantId}/ready`,
    expect.objectContaining({
      body: JSON.stringify({ expectedVersion: 4 }),
      headers: { "content-type": "application/json", "idempotency-key": "retry-1" },
    }),
  );
});
