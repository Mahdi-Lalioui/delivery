import { z } from "./schema.js";
import { merchantHoursInput } from "./merchant-hours.js";

// Persisted amounts and limits fit a PostgreSQL integer (MON-01).
const wholeDzd = z.int().min(0).max(2_147_483_647);
const usageLimit = z.int().min(0).max(2_147_483_647);

export const promotionCode = z
  .string()
  .max(64)
  .regex(/^[^\p{Cc}\p{Cs}]+$/u)
  .refine((code) => code.trim().length > 0, "Enter a promotion code.");

const activation = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("code"), code: promotionCode }),
  z.strictObject({ kind: z.literal("automatic") }),
]);

// These variants match the pricing domain's Promo input (MON-03).
const discount = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("percent"),
    basisPoints: z.int().min(0).max(10_000),
    capDzd: wholeDzd,
  }),
  z.strictObject({ kind: z.literal("fixed"), amountDzd: wholeDzd }),
  z.strictObject({ kind: z.literal("free_delivery") }),
]);

const conditions = z
  .strictObject({
    minimumSubtotalDzd: wholeDzd.optional(),
    // Date and weekly restrictions use the Algiers civil calendar, as in restaurant hours.
    startsOn: z.iso.date().optional(),
    endsOn: z.iso.date().optional(),
    weekly: merchantHoursInput.shape.weekly.optional(),
    firstOrderOnly: z.boolean().optional(),
    maxUsesTotal: usageLimit.optional(),
    maxUsesPerCustomer: usageLimit.optional(),
  })
  .refine(
    ({ startsOn, endsOn }) => startsOn === undefined || endsOn === undefined || startsOn <= endsOn,
    { path: ["endsOn"], message: "The end date cannot precede the start date." },
  );

export const merchantPromotionInput = z.strictObject({ activation, discount, conditions });

export const merchantPromotionOutput = merchantPromotionInput.extend({
  promotionId: z.uuid(),
  merchantId: z.uuid(),
  stats: z.strictObject({
    uses: z.int().nonnegative(),
    salesDzd: z.int().nonnegative(),
  }),
});

export const quotePromotionRejectionCode = z.enum([
  "promotion_expired",
  "promotion_below_minimum",
  "promotion_used_up",
  "promotion_wrong_restaurant",
]);

export const merchantPromotionListOutput = z.strictObject({
  sessionId: z.uuid(),
  promotions: z.array(merchantPromotionOutput).max(100),
});
