import { expect, test } from "vitest";
import {
  merchantPromotionInput,
  merchantPromotionOutput,
  promotionCode,
  quotePromotionRejectionCode,
} from "../src/promotions.ts";

const codeActivation = { kind: "code", code: "IFTAR" };
const percentDiscount = { kind: "percent", basisPoints: 1_250, capDzd: 500 };
const promotion = { activation: codeActivation, discount: percentDiscount, conditions: {} };

const weekly = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  ranges: weekday === 5 ? [{ opensMinute: 1_080, closesMinute: 120 }] : [],
}));

test.each([
  [codeActivation, percentDiscount],
  [{ kind: "automatic" }, { kind: "fixed", amountDzd: 400 }],
  [{ kind: "automatic" }, { kind: "free_delivery" }],
])("[MER-19:contract] accepts activation %j with discount %j", (activation, discount) => {
  const input = { activation, discount, conditions: {} };
  expect(merchantPromotionInput.parse(input)).toEqual(input);
});

test.each([
  ["a code activation with no code", { activation: { kind: "code" } }],
  ["an automatic activation with a code", { activation: { kind: "automatic", code: "IFTAR" } }],
  ["a percent discount with no cap", { discount: { kind: "percent", basisPoints: 250 } }],
  ["a percentage over 100%", { discount: { ...percentDiscount, basisPoints: 10_001 } }],
  ["negative basis points", { discount: { ...percentDiscount, basisPoints: -1 } }],
  ["fractional basis points", { discount: { ...percentDiscount, basisPoints: 250.5 } }],
  ["a fractional cap", { discount: { ...percentDiscount, capDzd: 5.5 } }],
  ["a negative fixed discount", { discount: { kind: "fixed", amountDzd: -1 } }],
  [
    "an amount above the integer DZD bound",
    { discount: { kind: "fixed", amountDzd: 2_147_483_648 } },
  ],
  ["a cap on a fixed discount", { discount: { kind: "fixed", amountDzd: 30, capDzd: 20 } }],
  ["a price on free delivery", { discount: { kind: "free_delivery", amountDzd: 400 } }],
  ["a second discount", { discounts: [{ kind: "free_delivery" }] }],
  ["server-owned stats", { stats: { uses: 8, salesDzd: 400 } }],
  ["a client-supplied merchant id", { merchantId: "01932f18-3150-7c33-8a7a-53acfd343001" }],
])("[MER-19:contract] rejects %s", (_reason, fields) => {
  expect(merchantPromotionInput.safeParse({ ...promotion, ...fields }).success).toBe(false);
});

test("[CUS-16:contract] bounds codes without changing their spelling", () => {
  expect(promotionCode.parse("iftar-إفطار")).toBe("iftar-إفطار");
  expect(promotionCode.parse("X".repeat(64))).toBe("X".repeat(64));
  for (const value of ["", "   ", "X".repeat(65), "A\0B", "A\nB", "A\uD800B", 123]) {
    expect(promotionCode.safeParse(value).success).toBe(false);
    expect(
      merchantPromotionInput.safeParse({ ...promotion, activation: { kind: "code", code: value } })
        .success,
    ).toBe(false);
  }
});

test("[MER-19:contract] accepts a same-day offer with Algiers weekly ranges and usage caps", () => {
  const input = {
    ...promotion,
    conditions: {
      minimumSubtotalDzd: 1_000,
      startsOn: "2026-12-25",
      endsOn: "2026-12-25",
      weekly,
      firstOrderOnly: true,
      maxUsesTotal: 100,
      maxUsesPerCustomer: 1,
    },
  };
  expect(merchantPromotionInput.parse(input)).toEqual(input);
});

test.each([
  ["an impossible date", { startsOn: "2026-02-30" }],
  ["a reversed date window", { startsOn: "2026-12-25", endsOn: "2026-12-24" }],
  ["a negative subtotal minimum", { minimumSubtotalDzd: -1 }],
  ["a fractional subtotal minimum", { minimumSubtotalDzd: 10.5 }],
  ["a repeated weekday", { weekly: [...weekly.slice(0, 6), { weekday: 5, ranges: [] }] }],
  [
    "an out-of-range time",
    {
      weekly: [
        ...weekly.slice(0, 6),
        { weekday: 6, ranges: [{ opensMinute: 1_441, closesMinute: 60 }] },
      ],
    },
  ],
  ["a negative total usage cap", { maxUsesTotal: -1 }],
  ["a fractional customer usage cap", { maxUsesPerCustomer: 0.5 }],
  ["a total usage cap above the integer bound", { maxUsesTotal: 2_147_483_648 }],
  ["a non-boolean first-order condition", { firstOrderOnly: 1 }],
  ["an unknown condition", { customerId: "customer-id" }],
])("[MER-19:contract] rejects %s", (_reason, conditions) => {
  expect(merchantPromotionInput.safeParse({ ...promotion, conditions }).success).toBe(false);
});

test("[MER-19:contract] reads merchant and promotion ids with whole-DZD sales and use count", () => {
  const output = {
    ...promotion,
    promotionId: "01932f18-3150-7c33-8a7a-53acfd343001",
    merchantId: "01932f18-3150-7c33-8a7a-53acfd343002",
    stats: { uses: 9, salesDzd: 3_000_000_000 },
  };
  expect(merchantPromotionOutput.parse(output)).toEqual(output);
  for (const stats of [
    { uses: -1, salesDzd: 0 },
    { uses: 1.5, salesDzd: 0 },
    { uses: 0, salesDzd: 1.5 },
    { uses: 0, salesDzd: Number.MAX_SAFE_INTEGER + 1 },
    { uses: 0, salesDzd: 0, customerId: "customer-id" },
  ]) {
    expect(merchantPromotionOutput.safeParse({ ...output, stats }).success).toBe(false);
  }
  expect(merchantPromotionOutput.safeParse({ ...output, promotionId: "invalid" }).success).toBe(
    false,
  );
});

test("[CUS-16:contract] exposes the four precise quote rejection codes", () => {
  expect(quotePromotionRejectionCode.options).toEqual([
    "promotion_expired",
    "promotion_below_minimum",
    "promotion_used_up",
    "promotion_wrong_restaurant",
  ]);
  expect(quotePromotionRejectionCode.safeParse("invalid_pricing").success).toBe(false);
});
