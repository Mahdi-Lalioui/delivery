import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { listPromotions, savePromotion } from "../src/retention/promotions-http";
import {
  promotionMockIds as ids,
  promotionsHandlers,
  promotionsMockState,
} from "./mocks/promotions-handlers";

const server = setupServer();
let state = promotionsMockState();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  state = promotionsMockState();
  server.resetHandlers(...promotionsHandlers(state));
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://merchant.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

const fixed = {
  activation: { kind: "automatic" as const },
  discount: { kind: "fixed" as const, amountDzd: 200 },
  conditions: {},
};

test("[MER-19] lists promotions with their stats", async () => {
  const result = await listPromotions(ids.merchantId);
  expect(result).toMatchObject({
    kind: "ready",
    promotions: [{ stats: { uses: 42, salesDzd: 98_500 } }],
  });
  expect(await listPromotions(ids.promotionId)).toEqual({ kind: "not-found" });
});

test("[MER-19] creates and updates promotions", async () => {
  const created = await savePromotion({ merchantId: ids.merchantId, promotion: fixed, key: "k1" });
  expect(created).toMatchObject({
    kind: "saved",
    promotion: { promotionId: ids.createdId, stats: { uses: 0 } },
  });
  const updated = await savePromotion({
    merchantId: ids.merchantId,
    promotionId: ids.promotionId,
    promotion: { ...fixed, activation: { kind: "code", code: "IFTAR" } },
    key: "k2",
  });
  expect(updated).toMatchObject({ kind: "saved", promotion: { stats: { uses: 42 } } });
  expect(state.promotions).toHaveLength(2);
});

test("[MER-19] reports a code already used by another promotion", async () => {
  const duplicate = { ...fixed, activation: { kind: "code" as const, code: "IFTAR" } };
  expect(
    await savePromotion({ merchantId: ids.merchantId, promotion: duplicate, key: "k3" }),
  ).toEqual({
    kind: "duplicate-code",
  });
});
