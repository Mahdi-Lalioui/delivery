import { expect, test } from "vitest";
import {
  bulkPriceApplyInput,
  bulkPricePreviewInput,
  bulkPricePreviewOutput,
  bulkPriceUndoInput,
  bulkPriceUndoOutput,
} from "../src/menu-price.ts";

const itemId = "01932f18-3150-7c33-8a7a-53acfd343001";
const otherId = "01932f18-3150-7c33-8a7a-53acfd343002";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343003";

test("[MER-11:contract] accepts a percent or fixed adjustment over unique item ids", () => {
  const percent = {
    itemIds: [itemId, otherId],
    adjustment: { kind: "percent", basisPoints: 1_000 },
    roundingUnit: 10,
  };
  expect(bulkPricePreviewInput.parse(percent)).toEqual(percent);
  const fixed = {
    itemIds: [itemId],
    adjustment: { kind: "fixed", amountDzd: -50 },
    roundingUnit: 1,
  };
  expect(bulkPricePreviewInput.parse(fixed)).toEqual(fixed);

  for (const input of [
    { ...percent, itemIds: [] },
    { ...percent, itemIds: [itemId, itemId.toUpperCase()] },
    { ...percent, roundingUnit: 2 },
    { ...percent, adjustment: { kind: "percent", basisPoints: 100_001 } },
    { ...fixed, adjustment: { kind: "fixed", amountDzd: 10_000_001 } },
    { ...percent, adjustment: { kind: "unknown", basisPoints: 1 } },
  ]) {
    expect(bulkPricePreviewInput.safeParse(input).success).toBe(false);
  }
});

test("[MER-11:contract] binds the apply command to the expected menu revision", () => {
  const apply = {
    itemIds: [itemId],
    adjustment: { kind: "percent", basisPoints: -1_000 },
    roundingUnit: 10,
    expectedRevision: 4,
  };
  expect(bulkPriceApplyInput.parse(apply)).toEqual(apply);
  expect(bulkPriceApplyInput.safeParse({ ...apply, expectedRevision: -1 }).success).toBe(false);
});

test("[MER-11:contract] reports each item's old and new whole-dinar price", () => {
  const output = {
    sessionId,
    revision: 5,
    items: [{ itemId, oldPriceDzd: 500, newPriceDzd: 550 }],
  };
  expect(bulkPricePreviewOutput.parse(output)).toEqual(output);
  expect(
    bulkPricePreviewOutput.safeParse({
      ...output,
      items: [{ itemId, oldPriceDzd: -1, newPriceDzd: 0 }],
    }).success,
  ).toBe(false);
});

test("[MER-11:contract] undoes a batch against the expected revision only", () => {
  expect(bulkPriceUndoInput.parse({ expectedRevision: 5 })).toEqual({ expectedRevision: 5 });
  expect(bulkPriceUndoInput.safeParse({ expectedRevision: -1 }).success).toBe(false);
  expect(
    bulkPriceUndoInput.safeParse({ expectedRevision: 5, items: [{ itemId, priceDzd: 1 }] }).success,
  ).toBe(false);
  const output = {
    batchId: otherId,
    revision: 6,
    items: [{ itemId, oldPriceDzd: 550, newPriceDzd: 500 }],
  };
  expect(bulkPriceUndoOutput.parse(output)).toEqual(output);
});
