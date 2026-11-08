import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantReviewPageOutput,
  merchantReviewReplyInput,
  merchantReviewReplyOutput,
  merchantReviewReportInput,
  merchantReviewReportOutput,
  orderRatingInput,
  orderRatingOutput,
} from "@zaafran/contracts/ratings";

// CUS-22 / MER-20 ratings client on lane A's ratings contract. Routes are requested in
// docs/requests/lane-b-ratings.md and mocked with MSW until they land.

type RatingInput = ReturnType<typeof orderRatingInput.parse>;
export type OrderRating = ReturnType<typeof orderRatingOutput.parse>;
export type MerchantReview = ReturnType<typeof merchantReviewPageOutput.parse>["reviews"][number];
export type RatingDraft = { foodStars: number; deliveryStars: number | undefined; comment: string };
type Failure = { kind: "sign-in" | "not-found" | "closed" | "error" };
export type RatingLoad = { kind: "ready"; rating: OrderRating | null } | Failure;
export type RatingSave =
  { kind: "saved"; rating: OrderRating } | { kind: "invalid"; field: string } | Failure;
export type ReviewPage =
  | { kind: "ready"; reviews: MerchantReview[]; nextCursor: string | null }
  | { kind: "sign-in" | "not-found" | "error" };
export type ReviewWrite = { kind: "saved" } | { kind: "invalid" } | Failure;

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;
// The server answers 409 with this code once the 24 h edit window has passed.
const closedCodes: ReadonlySet<string> = new Set(["edit_window_closed", "not_eligible"]);

function orderRatingPath(orderId: string): string {
  return `/v1/orders/${encodeURIComponent(orderId)}/rating`;
}

function reviewPath(merchantId: string, suffix = ""): string {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/reviews${suffix}`;
}

async function failure(response: Response): Promise<Failure> {
  if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
  if (response.status === 404) return { kind: "not-found" };
  if (response.status !== 409) return { kind: "error" };
  const problem = problemResponseSchema.safeParse(await response.json());
  return { kind: problem.success && closedCodes.has(problem.data.code) ? "closed" : "error" };
}

function writeInit(method: "PUT" | "POST", body: unknown, key: string): RequestInit {
  return {
    ...requestOptions,
    method,
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  };
}

/** True while the customer may still change the rating or the merchant its reply. */
export function isEditable(editableUntil: string, nowMs: number): boolean {
  return nowMs < Date.parse(editableUntil);
}

export async function loadOrderRating(orderId: string, signal?: AbortSignal): Promise<RatingLoad> {
  try {
    const response = await fetch(orderRatingPath(orderId), {
      ...requestOptions,
      ...(signal && { signal }),
    });
    if (response.status === 204) return { kind: "ready", rating: null };
    if (!response.ok) return await failure(response);
    const output = orderRatingOutput.safeParse(await response.json());
    return output.success && output.data.orderId === orderId
      ? { kind: "ready", rating: output.data }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** Builds the contract input; delivery orders must rate the delivery too (CUS-22). */
function draftToRatingInput(
  draft: RatingDraft,
  isDelivery: boolean,
): { kind: "ready"; input: RatingInput } | { kind: "invalid"; field: string } {
  if (isDelivery && draft.deliveryStars === undefined)
    return { kind: "invalid", field: "deliveryStars" };
  const comment = draft.comment.trim();
  const parsed = orderRatingInput.safeParse({
    foodStars: draft.foodStars,
    ...(isDelivery && { deliveryStars: draft.deliveryStars }),
    ...(comment !== "" && { comment }),
  });
  if (parsed.success) return { kind: "ready", input: parsed.data };
  const field = parsed.error.issues[0]?.path[0];
  return { kind: "invalid", field: typeof field === "string" ? field : "foodStars" };
}

/** CUS-22: submit or replace the complete rating of one order. */
export async function saveOrderRating(input: {
  orderId: string;
  draft: RatingDraft;
  isDelivery: boolean;
  key: string;
}): Promise<RatingSave> {
  const parsed = draftToRatingInput(input.draft, input.isDelivery);
  if (parsed.kind === "invalid") return parsed;
  const body = parsed.input;
  try {
    const response = await fetch(orderRatingPath(input.orderId), writeInit("PUT", body, input.key));
    if (!response.ok) return await failure(response);
    const output = orderRatingOutput.safeParse(await response.json());
    return output.success && output.data.orderId === input.orderId
      ? { kind: "saved", rating: output.data }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** MER-20: one page of reviews, optionally filtered by food stars. */
export async function listMerchantReviews(input: {
  merchantId: string;
  stars?: number | undefined;
  cursor?: string | undefined;
  signal?: AbortSignal | undefined;
}): Promise<ReviewPage> {
  const query = new URLSearchParams({ limit: "20" });
  if (input.stars !== undefined) query.set("stars", String(input.stars));
  if (input.cursor !== undefined) query.set("cursor", input.cursor);
  try {
    const response = await fetch(`${reviewPath(input.merchantId)}?${query.toString()}`, {
      ...requestOptions,
      ...(input.signal && { signal: input.signal }),
    });
    if (!response.ok) {
      const kind = (await failure(response)).kind;
      return { kind: kind === "closed" ? "error" : kind };
    }
    const output = merchantReviewPageOutput.safeParse(await response.json());
    if (
      !output.success ||
      (input.cursor !== undefined && output.data.nextCursor === input.cursor)
    ) {
      return { kind: "error" };
    }
    return { kind: "ready", reviews: output.data.reviews, nextCursor: output.data.nextCursor };
  } catch {
    return { kind: "error" };
  }
}

async function writeReview(input: {
  path: string;
  method: "PUT" | "POST";
  body: unknown;
  key: string;
  ratingId: string;
  output: typeof merchantReviewReplyOutput | typeof merchantReviewReportOutput;
}): Promise<ReviewWrite> {
  try {
    const response = await fetch(input.path, writeInit(input.method, input.body, input.key));
    if (!response.ok) return await failure(response);
    const output = input.output.safeParse(await response.json());
    return output.success && output.data.ratingId === input.ratingId
      ? { kind: "saved" }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** MER-20: one reply per review; PUT replaces it while it is still editable. */
export async function replyToReview(input: {
  merchantId: string;
  ratingId: string;
  body: string;
  key: string;
}): Promise<ReviewWrite> {
  const parsed = merchantReviewReplyInput.safeParse({ body: input.body });
  if (!parsed.success) return { kind: "invalid" };
  const path = reviewPath(input.merchantId, `/${encodeURIComponent(input.ratingId)}/reply`);
  return writeReview({
    ...input,
    path,
    method: "PUT",
    body: parsed.data,
    output: merchantReviewReplyOutput,
  });
}

/** MER-20: report an abusive review to the admin. */
export async function reportReview(input: {
  merchantId: string;
  ratingId: string;
  reason: string;
  key: string;
}): Promise<ReviewWrite> {
  const parsed = merchantReviewReportInput.safeParse({ reason: input.reason });
  if (!parsed.success) return { kind: "invalid" };
  const path = reviewPath(input.merchantId, `/${encodeURIComponent(input.ratingId)}/report`);
  return writeReview({
    ...input,
    path,
    method: "POST",
    body: parsed.data,
    output: merchantReviewReportOutput,
  });
}
