import { z } from "zod";
import { publishedPhoto } from "./media.js";
import { menuCategoryInput, menuItemInput } from "./menu.js";

// The customer-facing preview exposes no moderation, archive or option-library internals (§17.3).
const previewItem = menuItemInput
  .pick({ names: true, descriptions: true, priceDzd: true, tags: true })
  .extend({
    itemId: z.uuid(),
    isAvailable: z.boolean(),
    soldOutUntil: z.iso.datetime().nullable(),
    photo: publishedPhoto.nullable(),
  })
  .refine(({ isAvailable, soldOutUntil }) => !isAvailable || soldOutUntil === null);

const previewCategory = z.strictObject({
  categoryId: z.uuid(),
  names: menuCategoryInput.shape.names,
  items: z.array(previewItem).min(1).max(2000),
});

export const menuPreviewOutput = z.strictObject({
  revision: z.int().nonnegative(),
  restaurantName: z.string().min(1).max(120),
  categories: z.array(previewCategory).max(1000),
});
