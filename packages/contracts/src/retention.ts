import { z } from "./schema.js";
import { normalizedEmail } from "./auth.js";
import { menuImportInput } from "./menu-import.js";
import { menuItemInput } from "./menu.js";
import { pageLimit } from "./pagination.js";
import { orderRatingOutput } from "./ratings.js";
import { publicRestaurantParams } from "./restaurant.js";

const uuid = z.uuid();
const instant = z.iso.datetime();
const integer = z.int().nonnegative();
const rate = z.int().min(0).max(10_000);
const orderStatus = z.enum([
  "scheduled",
  "pending_acceptance",
  "accepted",
  "ready",
  "out_for_delivery",
  "delivered",
  "collected",
  "rejected",
  "expired",
  "cancelled",
  "delivery_failed",
]);
const phoneE164 = z.string().regex(/^\+213[567][0-9]{8}$/);
const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((text) => !text.includes("\0") && !/\p{Cs}/u.test(text));

export const orderRecipientInput = z.strictObject({ name, phoneE164, shareTracking: z.boolean() });

export const customerFavouritesOutput = z.strictObject({
  restaurants: z
    .array(
      z.strictObject({
        merchantId: uuid,
        name: z.string().min(1).max(120),
        slug: z.string().min(1).max(128),
        coverMediaId: uuid.nullable(),
        isOpen: z.boolean(),
      }),
    )
    .max(100),
});
export const customerFavouriteWriteOutput = z.strictObject({
  merchantId: uuid,
  isFavourite: z.boolean(),
});

const orderSummary = z.strictObject({
  orderId: uuid,
  merchantId: uuid,
  restaurantName: z.string().min(1).max(120),
  shortCode: z.string().min(1).max(7),
  status: orderStatus,
  fulfilment: z.enum(["delivery", "pickup"]),
  totalDzd: integer,
  placedAt: instant,
});
const cursorParts = z.strictObject({ placedAt: instant, orderId: uuid });

export function readOrderHistoryCursor(cursor: string) {
  const [placedAt, orderId, extra] = cursor.split("~");
  if (extra !== undefined) return undefined;
  const result = cursorParts.safeParse({ placedAt, orderId });
  return result.success ? result.data : undefined;
}

const orderCursor = z
  .string()
  .max(96)
  .refine((cursor) => readOrderHistoryCursor(cursor) !== undefined);
export const customerOrderHistoryQuery = z.strictObject({
  limit: pageLimit,
  cursor: orderCursor.optional(),
});
export const customerOrderHistoryOutput = z.strictObject({
  orders: z
    .array(
      orderSummary.extend({
        restaurantSlug: publicRestaurantParams.shape.slug.nullable().optional(),
      }),
    )
    .max(100),
  nextCursor: orderCursor.nullable(),
});

const displayName = menuItemInput.shape.names;
const snapshotOption = z.strictObject({
  optionId: uuid,
  names: displayName,
  priceDeltaDzd: integer,
});
const receiptLine = z.strictObject({
  itemId: uuid,
  names: displayName,
  unitPriceDzd: integer,
  quantity: z.int().positive(),
  options: z.array(snapshotOption),
  lineTotalDzd: integer,
});
export const customerOrderReceiptOutput = orderSummary
  .extend({
    lines: z.array(receiptLine),
    subtotalDzd: integer,
    discountDzd: integer,
    deliveryFeeDzd: integer,
  })
  .refine(
    ({ subtotalDzd, discountDzd, deliveryFeeDzd, totalDzd }) =>
      discountDzd <= subtotalDzd && totalDzd === subtotalDzd - discountDzd + deliveryFeeDzd,
    { path: ["totalDzd"] },
  );

export const customerReorderOutput = z.strictObject({
  draft: z.strictObject({
    merchantId: uuid,
    restaurantSlug: publicRestaurantParams.shape.slug.nullable().optional(),
    menuRevision: z.int().nonnegative().optional(),
    items: z.array(
      z.strictObject({
        itemId: uuid,
        quantity: z.int().positive(),
        optionIds: z.array(uuid),
      }),
    ),
  }),
  unavailable: z.array(uuid),
  priceChanges: z.array(z.strictObject({ itemId: uuid, oldDzd: integer, newDzd: integer })),
});

export const merchantAnalyticsQuery = z
  .strictObject({ from: z.iso.date(), to: z.iso.date() })
  .refine(({ from, to }) => from <= to, { path: ["to"] });
const totals = {
  orders: integer,
  salesDzd: integer,
  averageTicketDzd: integer,
  acceptanceRate: rate,
  avgPrepSeconds: integer,
  avgDeliverySeconds: integer,
};
const cancellations = z.array(
  z.strictObject({ reason: z.string().min(1).max(128), orders: integer }),
);
export const merchantAnalyticsOutput = z.strictObject({
  totals: z.strictObject(totals),
  cancellations,
  topItems: z.array(
    z.strictObject({ itemId: uuid, names: displayName, quantity: integer, salesDzd: integer }),
  ),
  heatmap: z.array(z.array(integer).length(24)).length(7),
  repeatCustomerRate: rate,
});
export const adminDashboardTodayOutput = z.strictObject({
  totals: z.strictObject(totals),
  cancellations,
  unresponsiveRestaurants: integer,
  errorRate: rate,
  jobBacklog: integer,
});

export const merchantMenuPhotoImportInput = z.strictObject({
  photoIds: z
    .array(uuid)
    .min(1)
    .max(5)
    .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length),
});
export const merchantMenuPhotoImportOutput = z.discriminatedUnion("status", [
  z.strictObject({ importId: uuid, status: z.literal("queued") }),
  z.strictObject({ importId: uuid, status: z.literal("ready"), rows: menuImportInput.shape.rows }),
  z.strictObject({ importId: uuid, status: z.literal("failed") }),
]);

export const customerPrivacyChallengeOutput = z.strictObject({
  challengeId: uuid,
  expiresAt: instant,
});
export const customerPrivacyDeleteOutput = z.void();
export const customerPrivacyDeleteInput = z.strictObject({
  challengeId: uuid,
  code: z.string().regex(/^[0-9]{6}$/),
});
export const customerPrivacyExportOutput = z.strictObject({
  profile: z.strictObject({
    accountId: uuid,
    phoneE164: phoneE164.nullable(),
    email: normalizedEmail.optional(),
  }),
  addresses: z.array(
    z.strictObject({
      addressId: uuid,
      label: z.string(),
      communeId: uuid.nullable(),
      plusCode: z.string().optional(),
      isDefault: z.boolean().optional(),
      building: z.string().optional(),
      floor: z.string().optional(),
      apartment: z.string().optional(),
      pin: z.strictObject({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
      landmark: z.string().nullable(),
      instructions: z.string().nullable(),
    }),
  ),
  orders: z.array(customerOrderReceiptOutput),
  orderContacts: z.array(z.strictObject({ orderId: uuid, phoneE164 })).optional(),
  ratings: z.array(orderRatingOutput),
});
