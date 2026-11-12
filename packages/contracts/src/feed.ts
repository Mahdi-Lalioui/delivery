import { z } from "./schema.js";
import { photoVariantWidths } from "./media.js";

const uuid = z.uuid();
const maxFeedPage = 50;
const booleanParam = z.enum(["true", "false"]).transform((value) => value === "true");
const priceLevel = z.literal([1, 2, 3]);
const amount = z.int().min(0).max(2_147_483_647);
const etaMinutes = z
  .strictObject({ min: z.int().nonnegative(), max: z.int().nonnegative() })
  .refine(({ min, max }) => min <= max, { path: ["max"] });

export const publicFeedQuery = z.strictObject({
  limit: z
    .string()
    .regex(/^[0-9]{1,2}$/u)
    .transform(Number)
    .pipe(z.int().min(1).max(maxFeedPage))
    .default(24),
  cursor: uuid.optional(),
  communeId: uuid.optional(),
  cuisine: z
    .string()
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .optional(),
  openNow: booleanParam.optional(),
  freeDelivery: booleanParam.optional(),
  acceptsBaridiPay: booleanParam.optional(),
  acceptsTpe: booleanParam.optional(),
  minRating: z
    .literal("4")
    .transform(() => 4 as const)
    .optional(),
  maxEtaMinutes: z
    .enum(["20", "30", "45"])
    .transform(Number)
    .pipe(z.literal([20, 30, 45]))
    .optional(),
  priceLevel: z.enum(["1", "2", "3"]).transform(Number).pipe(priceLevel).optional(),
  sort: z.enum(["relevance", "distance", "rating", "eta"]).optional(),
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
  rating: z.number().min(1).max(5).nullable().optional(),
  ratingCount: z.int().nonnegative().optional(),
  etaMinutes: etaMinutes.nullable().optional(),
  deliveryFeeDzd: amount.nullable().optional(),
  minimumOrderDzd: amount.nullable().optional(),
  priceLevel: priceLevel.nullable().optional(),
  acceptsBaridiPay: z.boolean().optional(),
  acceptsTpe: z.boolean().optional(),
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
