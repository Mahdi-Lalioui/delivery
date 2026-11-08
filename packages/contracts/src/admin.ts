import { z } from "zod";
import { communeListOutput, merchantApplicationInput } from "./merchant.js";
import { pageLimit } from "./pagination.js";

export const adminMerchantReviewInput = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !value.includes("\0")),
});

export const adminMerchantReviewOutput = z.strictObject({
  merchantId: z.uuid(),
  status: z.enum(["approved", "rejected"]),
  reviewedAt: z.iso.datetime(),
});

const cursorFields = z.strictObject({ submittedAt: z.iso.datetime(), merchantId: z.uuid() });

export function readAdminReviewCursor(cursor: string) {
  const [submittedAt, merchantId, extra] = cursor.split("~");
  if (extra !== undefined) return undefined;
  const result = cursorFields.safeParse({ submittedAt, merchantId });
  return result.success ? result.data : undefined;
}

export const adminReviewQueueQuery = z.strictObject({
  cursor: z
    .string()
    .max(96)
    .refine((cursor) => readAdminReviewCursor(cursor) !== undefined)
    .optional(),
  limit: pageLimit,
});

const applicationFields = merchantApplicationInput.shape;
const queuedApplication = z.strictObject({
  merchantId: z.uuid(),
  restaurantName: applicationFields.restaurantName,
  ownerName: applicationFields.ownerName,
  phoneE164: z
    .string()
    .length(13)
    .regex(/^\+213[567][0-9]{8}$/),
  commune: communeListOutput.shape.communes.element.pick({ id: true, nameAr: true, nameFr: true }),
  pin: applicationFields.pin,
  cuisines: applicationFields.cuisines,
  rcNumber: applicationFields.rcNumber.unwrap().nullable(),
  submittedAt: z.iso.datetime(),
});

export const adminReviewQueueOutput = z.strictObject({
  sessionId: z.uuid(),
  applications: z.array(queuedApplication).max(100),
  nextCursor: z.string().max(96).nullable(),
});

export const adminMerchantNoticeOutput = z
  .strictObject({
    sessionId: z.uuid(),
    pendingCount: z.int().nonnegative(),
    latestMerchantId: z.uuid().nullable(),
  })
  .refine(
    ({ pendingCount, latestMerchantId }) => (pendingCount === 0) === (latestMerchantId === null),
  );
