import { z } from "zod";
import { pageLimit } from "./pagination.js";

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

const communeCode = z
  .string()
  .length(4)
  .regex(/^[0-9]{4}$/);
const wilayaCode = z.int().min(1).max(69);
const commune = z.strictObject({
  id: uuid,
  code: communeCode,
  wilayaCode,
  nameAr: displayName,
  nameFr: displayName,
});

export const communeListQuery = z.strictObject({
  wilayaCode: z
    .string()
    .regex(/^[0-9]{1,2}$/)
    .transform(Number)
    .pipe(wilayaCode)
    .optional(),
  cursor: communeCode.optional(),
  limit: pageLimit,
});

export const communeListOutput = z.strictObject({
  communes: z.array(commune).max(100),
  nextCursor: z.string().min(1).max(128).nullable(),
});

export const merchantMembershipsOutput = z.strictObject({
  sessionId: uuid,
  memberships: z.array(
    z.strictObject({
      merchantId: uuid,
      restaurantName: displayName,
      status,
      role,
    }),
  ),
});

export const merchantOnboardingOutput = z.strictObject({
  sessionId: uuid,
  merchantId: uuid,
  restaurantName: displayName,
  steps: z.strictObject({
    profile: z.literal("complete"),
    hours: z.enum(["complete", "incomplete"]),
    menu: z.strictObject({
      itemsTowardMinimum: z.int().min(0).max(5),
      requiredItems: z.literal(5),
    }),
    deliveryZone: z.literal("unavailable"),
    testOrder: z.literal("unavailable"),
  }),
  canGoLive: z.literal(false),
});
