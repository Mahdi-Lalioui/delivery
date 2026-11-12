import type { createOrderQuoteRepository } from "@zaafran/db/order-quotes";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const itemId = "01932f18-3150-7c33-8a7a-53acfd343003";
const now = new Date("2026-11-11T12:00:00Z");
const payload = {
  merchantId,
  fulfilment: "pickup",
  timing: { kind: "asap" },
  items: [{ itemId, quantity: 1, optionIds: [] }],
};
const quote = {
  quoteId: itemId,
  fulfilment: "pickup",
  expiresAt: "2026-11-11T12:10:00Z",
  subtotalDzd: 500,
  deliveryFeeDzd: 0,
  totalDzd: 500,
} as const;

test("[MON-09:http] quotes the authenticated customer and returns only server prices", async () => {
  const create = vi.fn<ReturnType<typeof createOrderQuoteRepository>["create"]>();
  create.mockResolvedValue({ kind: "quoted", quote });
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId: itemId }),
    orderQuotes: { repository: { create }, now: () => now },
  });
  onTestFinished(() => api.close());
  const response = await api.inject({ method: "POST", url: "/v1/quotes", payload });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toEqual(quote);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(create).toHaveBeenCalledExactlyOnceWith({ customerId: accountId, input: payload, now });

  const forged = await api.inject({
    method: "POST",
    url: "/v1/quotes",
    payload: { ...payload, totalDzd: 1 },
  });
  expect(forged.statusCode).toBe(400);
  expect(create).toHaveBeenCalledTimes(1);

  create.mockResolvedValue({ kind: "address_not_found" });
  const foreign = await api.inject({ method: "POST", url: "/v1/quotes", payload });
  expect(foreign.statusCode).toBe(404);
});
