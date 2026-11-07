import { z } from "zod";

const uuid = z.uuid();
const wholeDzd = z.int().min(0).max(2_147_483_647);
const menuRevision = z.int().nonnegative();
const roundingUnit = z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(50)]);

const percentAdjustment = z.strictObject({
  kind: z.literal("percent"),
  basisPoints: z.int().min(-100_000).max(100_000),
});
const fixedAdjustment = z.strictObject({
  kind: z.literal("fixed"),
  amountDzd: z.int().min(-10_000_000).max(10_000_000),
});
export const bulkPriceAdjustment = z.discriminatedUnion("kind", [
  percentAdjustment,
  fixedAdjustment,
]);

const uniqueIds = (values: string[]) =>
  new Set(values.map((value) => value.toLowerCase())).size === values.length;
const itemIds = z.array(uuid).min(1).max(500).refine(uniqueIds, "List each item once.");

export const bulkPriceChangeItem = z.strictObject({
  itemId: uuid,
  oldPriceDzd: wholeDzd,
  newPriceDzd: wholeDzd,
});

export const bulkPricePreviewInput = z.strictObject({
  itemIds,
  adjustment: bulkPriceAdjustment,
  roundingUnit,
});

export const bulkPricePreviewOutput = z.strictObject({
  sessionId: uuid,
  revision: menuRevision,
  items: z.array(bulkPriceChangeItem).min(1).max(500),
});

export const bulkPriceApplyInput = bulkPricePreviewInput.extend({ expectedRevision: menuRevision });

export const bulkPriceApplyOutput = z.strictObject({
  batchId: uuid,
  revision: menuRevision,
  items: z.array(bulkPriceChangeItem).min(1).max(500),
});
