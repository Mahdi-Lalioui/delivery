import { z } from "zod";
import { pageLimit } from "./pagination.js";

const ratingId = z.uuid();
const instant = z.iso.datetime();
const stars = z.int().min(1).max(5);
const reviewText = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes("\0") && !/[\uD800-\uDFFF]/u.test(value));

// Submit and edit both replace the complete rating. Omit comment to leave it blank or clear it.
// The order determines ownership, eligibility, the edit deadline and whether deliveryStars is required.
export const orderRatingInput = z.strictObject({
  foodStars: stars,
  deliveryStars: stars.optional(),
  comment: reviewText.optional(),
});

const publicReply = z.strictObject({ body: reviewText, createdAt: instant });
const publicReview = z.strictObject({
  ratingId,
  foodStars: stars,
  deliveryStars: stars.nullable(),
  comment: reviewText.nullable(),
  createdAt: instant,
  reply: publicReply.nullable(),
});

export const orderRatingOutput = publicReview.extend({ orderId: z.uuid(), editableUntil: instant });

const cursorFields = z.strictObject({ createdAt: instant, ratingId });

export function readReviewCursor(cursor: string) {
  const [createdAt, ratingId, extra] = cursor.split("~");
  if (extra !== undefined) return undefined;
  const result = cursorFields.safeParse({ createdAt, ratingId });
  return result.success ? result.data : undefined;
}

const reviewCursor = z
  .string()
  .max(96)
  .refine((cursor) => readReviewCursor(cursor) !== undefined);

export const publicReviewPageQuery = z.strictObject({
  cursor: reviewCursor.optional(),
  limit: pageLimit,
});

export const publicReviewPageOutput = z.strictObject({
  reviews: z.array(publicReview).max(100),
  nextCursor: reviewCursor.nullable(),
});

export const merchantReviewPageQuery = publicReviewPageQuery.extend({
  // Food is the star score common to both delivery and pickup reviews.
  stars: z
    .string()
    .regex(/^[1-5]$/)
    .transform(Number)
    .pipe(stars)
    .optional(),
});

const merchantReply = publicReply.extend({ editableUntil: instant });
const merchantReview = publicReview.extend({ reply: merchantReply.nullable() });

export const merchantReviewPageOutput = publicReviewPageOutput.extend({
  reviews: z.array(merchantReview).max(100),
});

export const merchantReviewReplyInput = z.strictObject({ body: reviewText });
export const merchantReviewReplyOutput = z.strictObject({ ratingId, reply: merchantReply });

export const merchantReviewReportInput = z.strictObject({ reason: reviewText });
export const merchantReviewReportOutput = z.strictObject({ ratingId, reportedAt: instant });
