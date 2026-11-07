import { z } from "zod";

export const adminMerchantReviewInput = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !value.includes("\0")),
});

export const adminMerchantReviewOutput = z.strictObject({
  merchantId: z.uuid(),
  status: z.enum(["approved", "rejected"]),
  reviewedAt: z.iso.datetime(),
});
