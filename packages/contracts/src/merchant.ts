import { z } from "zod";

const hasNoNull = (value: string) => !value.includes("\0");
const displayName = z.string().trim().min(1).max(120).refine(hasNoNull);
const uuid = z.uuid();
const cuisine = z
  .string()
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const distinct = (values: readonly string[]) => new Set(values).size === values.length;
const status = z.enum(["pending_review", "approved", "rejected", "active", "paused", "suspended"]);
const role = z.enum(["owner", "manager", "staff"]);

export const merchantApplicationInput = z.strictObject({
  restaurantName: displayName,
  ownerName: displayName,
  communeId: uuid,
  pin: z.strictObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  cuisines: z.array(cuisine).min(1).max(5).refine(distinct, "Choose distinct cuisines."),
  rcNumber: z.string().trim().min(1).max(64).refine(hasNoNull).optional(),
  photoIds: z.array(uuid).max(5).refine(distinct, "Choose distinct photos.").optional(),
});

export const merchantApplicationOutput = z.strictObject({
  merchantId: uuid,
  status: z.literal("pending_review"),
});

const commune = z.strictObject({
  id: uuid,
  code: z
    .string()
    .length(4)
    .regex(/^[0-9]{4}$/),
  wilayaCode: z.int().min(1).max(69),
  nameAr: displayName,
  nameFr: displayName,
});

export const communeListOutput = z.strictObject({
  communes: z.array(commune).max(100),
  nextCursor: z.string().min(1).max(128).nullable(),
});

export const merchantMembershipsOutput = z.strictObject({
  memberships: z.array(
    z.strictObject({
      merchantId: uuid,
      restaurantName: displayName,
      status,
      role,
    }),
  ),
});
