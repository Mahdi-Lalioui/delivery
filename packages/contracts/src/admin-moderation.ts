import { z } from "./schema.js";
import { adminMerchantReviewInput } from "./admin.js";
import { menuItemInput } from "./menu.js";
import { pageLimit } from "./pagination.js";

/** SPEC §17.3 categories, matching `findProhibitedGoods` in `@zaafran/domain/moderation`. */
export const prohibitedCategory = z.enum(["alcohol", "tobacco", "medicine", "gambling"]);

/** ADM-04: an admin approves or rejects a held item with an audited reason. */
const reviewToken = z.string().regex(/^[a-f0-9]{64}$/u);
export const adminItemReviewInput = adminMerchantReviewInput.extend({
  reviewToken: reviewToken.optional(),
});

export const adminItemReviewOutput = z.strictObject({
  itemId: z.uuid(),
  merchantId: z.uuid(),
  moderationStatus: z.enum(["approved", "rejected"]),
  reviewedAt: z.iso.datetime(),
});

// Item ids are UUIDv7, so the keyset follows creation order.
export const adminItemQueueQuery = z.strictObject({
  cursor: z.uuid().optional(),
  limit: pageLimit,
  includeReviewToken: z.literal("1").optional(),
});

const heldItem = z.strictObject({
  itemId: z.uuid(),
  merchantId: z.uuid(),
  restaurantName: z.string().min(1).max(120),
  names: menuItemInput.shape.names,
  descriptions: menuItemInput.shape.descriptions,
  reviewToken: reviewToken.optional(),
  matches: z
    .array(prohibitedCategory)
    .max(4)
    .refine((values) => new Set(values).size === values.length),
});

export const adminItemQueueOutput = z.strictObject({
  sessionId: z.uuid(),
  items: z.array(heldItem).max(100),
  nextCursor: z.uuid().nullable(),
});
