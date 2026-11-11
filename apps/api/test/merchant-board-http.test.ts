import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343002";

test("[MER-03:http] scopes snapshots and replay to a merchant in the signed-in session", async () => {
  const board = vi.fn<ReturnType<typeof createOrderRepository>["board"]>();
  const snapshot = { orders: [], events: [], cursor: "8", hasMore: false };
  board.mockResolvedValueOnce(undefined).mockResolvedValueOnce(snapshot);
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () =>
      Promise.resolve({ role: "merchant_owner", accountId, sessionId: accountId }),
    merchantBoard: { board },
  });
  onTestFinished(() => api.close());
  const url = `/v1/merchants/${merchantId}/order-board`;
  expect((await api.inject(url)).statusCode).toBe(404);
  expect(board).toHaveBeenLastCalledWith({ accountId, merchantId });
  expect((await api.inject(url + "?after=9999999999999999999")).statusCode).toBe(400);
  const replay = await api.inject(url + "?after=8");
  expect(replay.statusCode).toBe(200);
  expect(replay.headers["cache-control"]).toBe("no-store");
  expect(replay.json()).toEqual(snapshot);
  expect(board).toHaveBeenLastCalledWith({ accountId, merchantId, after: "8" });
});
