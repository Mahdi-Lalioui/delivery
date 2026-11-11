import { z } from "zod";
import { publicRestaurantCard } from "./feed.js";
import { menuItemInput } from "./menu.js";

const maxSearchPage = 24;
export const publicSearchQuery = z.strictObject({
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => !value.includes("\0") && !/[\uD800-\uDFFF]/u.test(value)),
  limit: z
    .string()
    .regex(/^[0-9]{1,2}$/u)
    .transform(Number)
    .pipe(z.int().min(1).max(maxSearchPage))
    .default(12),
});

const searchRestaurant = publicRestaurantCard.pick({
  merchantId: true,
  slug: true,
  name: true,
  coverMediaId: true,
});
const searchDish = menuItemInput.pick({ names: true, priceDzd: true }).extend({
  itemId: z.uuid(),
  merchantId: searchRestaurant.shape.merchantId,
  merchantSlug: searchRestaurant.shape.slug,
  merchantName: searchRestaurant.shape.name,
  photoMediaId: z.uuid().nullable(),
});

export const publicSearchOutput = z.strictObject({
  restaurants: z.array(searchRestaurant).max(maxSearchPage),
  dishes: z.array(searchDish).max(maxSearchPage),
});
