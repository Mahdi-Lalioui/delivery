import { z } from "zod";
import { adminMerchantReviewInput } from "./admin.js";
import { menuItemInput } from "./menu.js";
import { pageLimit } from "./pagination.js";

/** SPEC §17.3 categories, matching `findProhibitedGoods` in `@zaafran/domain/moderation`. */
export const prohibitedCategory = z.enum(["alcohol", "tobacco", "medicine", "gambling"]);

/** ADM-04: an admin approves or rejects a held item with an audited reason. */
export const adminItemReviewInput = adminMerchantReviewInput;

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
});

const heldItem = z.strictObject({
  itemId: z.uuid(),
  merchantId: z.uuid(),
  restaurantName: z.string().min(1).max(120),
  names: menuItemInput.shape.names,
  descriptions: menuItemInput.shape.descriptions,
  // Empty when the text no longer matches, e.g. after an edit while held.
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
