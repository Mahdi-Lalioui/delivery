import { z } from "zod";
import { photoVariantWidths } from "./media.js";

const uuid = z.uuid();
const maxFeedPage = 50;

export const publicFeedQuery = z.strictObject({
  limit: z
    .string()
    .regex(/^[0-9]{1,2}$/u)
    .transform(Number)
    .pipe(z.int().min(1).max(maxFeedPage))
    .default(24),
  cursor: uuid.optional(),
});

export const publicRestaurantCard = z.strictObject({
  merchantId: uuid,
  slug: z.string().min(1),
  name: z.string().min(1).max(120),
  cuisines: z.array(z.string().min(1)).min(1).max(5),
  communeId: uuid,
  coverMediaId: uuid.nullable(),
  logoMediaId: uuid.nullable(),
  isOpen: z.boolean(),
  nextOpensAt: z.iso.datetime().nullable(),
});

export const publicFeedOutput = z.strictObject({
  restaurants: z.array(publicRestaurantCard).max(maxFeedPage),
  nextCursor: uuid.nullable(),
});

export const publicProfilePhotoParams = z.strictObject({
  merchantId: uuid,
  mediaId: uuid,
  format: z.enum(["avif", "webp"]),
  width: z
    .enum(photoVariantWidths.map(String))
    .transform(Number)
    .pipe(z.literal(photoVariantWidths)),
});
