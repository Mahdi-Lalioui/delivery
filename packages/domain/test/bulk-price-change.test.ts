import fc from "fast-check";
import { expect, test } from "vitest";
import { assertDomainProperty } from "./property.ts";
import { previewBulkPriceChange } from "../src/bulk-price-change.ts";
import { dzd, type Dzd } from "../src/money.ts";

function money(value: number): Dzd {
  const amount = dzd(value);
  if (!amount.ok) throw new Error(`Invalid fixture amount ${String(value)}`);
  return amount.value;
}

test("[MER-11:domain] rounds a percent increase to the nearest 10 DA", () => {
  const result = previewBulkPriceChange({
    items: [{ itemId: "a", priceDzd: money(199) }],
    adjustment: { kind: "percent", basisPoints: 1_000 },
    roundingUnit: 10,
  });
  // 199 * 1.10 = 218.9 -> nearest 10 DA with halves up -> 220
  expect(result).toEqual({
    ok: true,
    value: [{ itemId: "a", oldPriceDzd: 199, newPriceDzd: 220 }],
  });
});

test("[MER-11:domain] rounds a percent decrease to the nearest 50 DA", () => {
  const result = previewBulkPriceChange({
    items: [{ itemId: "a", priceDzd: money(1_000) }],
    adjustment: { kind: "percent", basisPoints: -1_500 },
    roundingUnit: 50,
  });
  // 1000 * 0.85 = 850, already a multiple of 50.
  expect(result).toEqual({
    ok: true,
    value: [{ itemId: "a", oldPriceDzd: 1_000, newPriceDzd: 850 }],
  });
});

test("[MER-11:domain] applies a fixed DA amount and rounds halves up", () => {
  const result = previewBulkPriceChange({
    items: [{ itemId: "a", priceDzd: money(123) }],
    adjustment: { kind: "fixed", amountDzd: 2 },
    roundingUnit: 5,
  });
  // 123 + 2 = 125, already a multiple of 5.
  expect(result).toEqual({
    ok: true,
    value: [{ itemId: "a", oldPriceDzd: 123, newPriceDzd: 125 }],
  });
});

test("[MER-11:domain] rounds exact halves up, not to even", () => {
  const result = previewBulkPriceChange({
    items: [{ itemId: "a", priceDzd: money(25) }],
    adjustment: { kind: "fixed", amountDzd: 0 },
    roundingUnit: 10,
  });
  // 25 is exactly between 20 and 30 -> rounds up to 30.
  expect(result).toEqual({
    ok: true,
    value: [{ itemId: "a", oldPriceDzd: 25, newPriceDzd: 30 }],
  });
});

test("[MER-11:domain] clamps a negative result to zero DZD", () => {
  const result = previewBulkPriceChange({
    items: [{ itemId: "a", priceDzd: money(50) }],
    adjustment: { kind: "fixed", amountDzd: -500 },
    roundingUnit: 10,
  });
  expect(result).toEqual({
    ok: true,
    value: [{ itemId: "a", oldPriceDzd: 50, newPriceDzd: 0 }],
  });
});

test("[MER-11:domain] previews every item in order with the same adjustment", () => {
  const result = previewBulkPriceChange({
    items: [
      { itemId: "a", priceDzd: money(100) },
      { itemId: "b", priceDzd: money(200) },
    ],
    adjustment: { kind: "percent", basisPoints: 1_000 },
    roundingUnit: 10,
  });
  expect(result).toEqual({
    ok: true,
    value: [
      { itemId: "a", oldPriceDzd: 100, newPriceDzd: 110 },
      { itemId: "b", oldPriceDzd: 200, newPriceDzd: 220 },
    ],
  });
});

test("[MER-11:domain] rejects an empty item selection", () => {
  const result = previewBulkPriceChange({
    items: [],
    adjustment: { kind: "fixed", amountDzd: 10 },
    roundingUnit: 10,
  });
  expect(result).toEqual({ ok: false, error: { code: "invalid_bulk_price_change" } });
});

test("[MER-11:domain] rejects a duplicate item id in the same selection", () => {
  const result = previewBulkPriceChange({
    items: [
      { itemId: "a", priceDzd: money(100) },
      { itemId: "a", priceDzd: money(100) },
    ],
    adjustment: { kind: "fixed", amountDzd: 10 },
    roundingUnit: 10,
  });
  expect(result).toEqual({ ok: false, error: { code: "invalid_bulk_price_change" } });
});

test.each([0, 2, 3, 100] as const)("[MER-11:domain] rejects a rounding unit of %s DA", (unit) => {
  const result = previewBulkPriceChange({
    items: [{ itemId: "a", priceDzd: money(100) }],
    adjustment: { kind: "fixed", amountDzd: 10 },
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-type-assertion
    roundingUnit: unit as 1 | 5 | 10 | 50,
  });
  expect(result).toEqual({ ok: false, error: { code: "invalid_bulk_price_change" } });
});

test.each([100_001, -100_001, 1.5, NaN] as const)(
  "[MER-11:domain] rejects an out-of-range percent adjustment of %s basis points",
  (basisPoints) => {
    const result = previewBulkPriceChange({
      items: [{ itemId: "a", priceDzd: money(100) }],
      adjustment: { kind: "percent", basisPoints },
      roundingUnit: 10,
    });
    expect(result).toEqual({ ok: false, error: { code: "invalid_bulk_price_change" } });
  },
);

test.each([10_000_001, -10_000_001, 1.5, NaN] as const)(
  "[MER-11:domain] rejects an out-of-range fixed adjustment of %s DA",
  (amountDzd) => {
    const result = previewBulkPriceChange({
      items: [{ itemId: "a", priceDzd: money(100) }],
      adjustment: { kind: "fixed", amountDzd },
      roundingUnit: 10,
    });
    expect(result).toEqual({ ok: false, error: { code: "invalid_bulk_price_change" } });
  },
);

test("[MER-11:domain] new prices are always a nonnegative multiple of the rounding unit", () => {
  assertDomainProperty(
    fc.property(
      fc.array(
        fc.record({
          itemId: fc.uuid(),
          priceDzd: fc.integer({ min: 0, max: 1_000_000 }),
        }),
        { minLength: 1, maxLength: 20 },
      ),
      fc.oneof(
        fc.record({
          kind: fc.constant("percent" as const),
          basisPoints: fc.integer({ min: -100_000, max: 100_000 }),
        }),
        fc.record({
          kind: fc.constant("fixed" as const),
          amountDzd: fc.integer({ min: -10_000_000, max: 10_000_000 }),
        }),
      ),
      fc.constantFrom(1, 5, 10, 50),
      (rawItems, adjustment, roundingUnit) => {
        const itemIds = new Set(rawItems.map((item) => item.itemId));
        const items = rawItems
          .filter((item) => itemIds.delete(item.itemId))
          .map((item) => ({ ...item, priceDzd: money(item.priceDzd) }));
        if (items.length === 0) return;
        const result = previewBulkPriceChange({ items, adjustment, roundingUnit });
        if (!result.ok) throw new Error("Expected a valid preview.");
        for (const change of result.value) {
          expect(change.newPriceDzd).toBeGreaterThanOrEqual(0);
          expect(change.newPriceDzd % roundingUnit).toBe(0);
        }
      },
    ),
  );
});
