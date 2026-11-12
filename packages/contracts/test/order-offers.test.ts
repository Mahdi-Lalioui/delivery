import { expect, test } from "vitest";
import { orderQuoteInput, orderQuoteOutput } from "../src/orders.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";

test("[CUS-16] accepts one trimmed code and rejects empty codes", () => {
  const quote = {
    fulfilment: "pickup",
    merchantId: id,
    timing: { kind: "asap" },
    items: [{ itemId: id, quantity: 1, optionIds: [] }],
  };
  expect(orderQuoteInput.parse({ ...quote, promotionCode: "  AWID  " }).promotionCode).toBe("AWID");
  expect(orderQuoteInput.safeParse({ ...quote, promotionCode: "   " }).success).toBe(false);
});

test("[MON-05] validates discounted quotes and legacy undiscounted quotes", () => {
  const quote = {
    quoteId: id,
    fulfilment: "delivery",
    expiresAt: "2026-11-12T22:00:00Z",
    subtotalDzd: 800,
    deliveryFeeDzd: 100,
  };
  expect(orderQuoteOutput.safeParse({ ...quote, totalDzd: 900 }).success).toBe(true);
  expect(orderQuoteOutput.safeParse({ ...quote, discountDzd: 200, totalDzd: 700 }).success).toBe(
    true,
  );
  expect(orderQuoteOutput.safeParse({ ...quote, discountDzd: 200, totalDzd: 900 }).success).toBe(
    false,
  );
  expect(orderQuoteOutput.safeParse({ ...quote, discountDzd: 850, totalDzd: 50 }).success).toBe(
    false,
  );
});
