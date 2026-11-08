import { z } from "zod";
import { publicRestaurantCard } from "./feed.js";
import { merchantHoursInput } from "./merchant-hours.js";
import {
  menuCategoryWriteOutput,
  menuItemPageQuery,
  menuPreviewDetailOutput,
  menuPreviewItemQuery,
  menuPreviewPageOutput,
  readMenuItemCursor,
} from "./menu.js";

const slug = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\p{L}\p{N}_-]+$/u);

export const publicRestaurantParams = z.strictObject({ slug });
export const publicRestaurantCategoryParams = publicRestaurantParams.extend({
  categoryId: z.uuid(),
});
export const publicRestaurantItemParams = publicRestaurantParams.extend({ itemId: z.uuid() });

export const publicRestaurantOutput = z.strictObject({
  restaurant: publicRestaurantCard.extend({
    slug,
    hours: merchantHoursInput,
    pausedUntil: z.iso.datetime({ offset: true }).nullable(),
  }),
  revision: menuPreviewPageOutput.shape.revision,
  categories: z.array(menuCategoryWriteOutput.shape.category).max(1000),
});

export const publicRestaurantItemsQuery = menuItemPageQuery.omit({ categoryId: true });

export const publicRestaurantItemsOutput = z
  .strictObject({
    revision: menuPreviewPageOutput.shape.revision,
    items: menuPreviewPageOutput.shape.items,
    nextCursor: menuPreviewPageOutput.shape.nextCursor,
  })
  .refine(
    ({ revision, nextCursor }) =>
      nextCursor === null || readMenuItemCursor(nextCursor)?.revision === revision,
  );

export const publicRestaurantItemQuery = menuPreviewItemQuery;
export const publicRestaurantItemOutput = menuPreviewDetailOutput.omit({ sessionId: true });
