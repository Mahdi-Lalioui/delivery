import {
  adminItemQueueOutput,
  adminItemReviewInput,
  adminItemReviewOutput,
} from "@zaafran/contracts/admin-moderation";
import { problemResponseSchema } from "@zaafran/contracts/health";

type HeldPage = ReturnType<typeof adminItemQueueOutput.parse>;
type ReviewInput = ReturnType<typeof adminItemReviewInput.parse>;
type HeldItemReview = Readonly<{
  itemId: string;
  expectedSessionId: string;
  input: ReviewInput;
  key: string;
}>;
type HeldPageRequest =
  { cursor?: never; expectedSessionId?: never } | { cursor: string; expectedSessionId: string };
type HeldPageResult =
  { kind: "ready"; page: HeldPage } | { kind: "sign-in" | "session-changed" | "error" };
type ReviewResult = {
  kind: "approved" | "rejected" | "sign-in" | "session-changed" | "stale" | "error";
};

const endpoint = "/v1/admin/menu-items";
const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

async function readHeldPage(
  response: Response,
  { cursor, expectedSessionId }: HeldPageRequest,
): Promise<HeldPageResult> {
  const result = adminItemQueueOutput.safeParse(await response.json());
  if (!result.success) return { kind: "error" };
  if (expectedSessionId !== undefined && result.data.sessionId !== expectedSessionId) {
    return { kind: "session-changed" };
  }
  // A cursor that does not advance would page forever.
  if (cursor !== undefined && result.data.nextCursor === cursor) return { kind: "error" };
  return { kind: "ready", page: result.data };
}

/** ADM-04: one page of items held by the prohibited-goods screen. */
export async function listHeldMenuItems(
  request: HeldPageRequest & { signal?: AbortSignal },
): Promise<HeldPageResult> {
  const { cursor, signal } = request;
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  try {
    const response = await fetch(`${endpoint}/held?${query.toString()}`, {
      ...requestOptions,
      method: "GET",
      ...(signal && { signal }),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (!response.ok) return { kind: "error" };
    return await readHeldPage(response, request);
  } catch {
    return { kind: "error" };
  }
}

function isSameReview(previous: HeldItemReview | undefined, next: Omit<HeldItemReview, "key">) {
  return (
    previous?.itemId === next.itemId &&
    previous.expectedSessionId === next.expectedSessionId &&
    previous.input.decision === next.input.decision &&
    previous.input.reason === next.input.reason
  );
}

/** Validates the decision and reuses the previous key only for an identical retry. */
export function prepareHeldItemReview({
  itemId,
  expectedSessionId,
  decision,
  reason,
  previous,
}: {
  itemId: string;
  expectedSessionId: string;
  decision: ReviewInput["decision"] | "";
  reason: string;
  previous?: HeldItemReview | undefined;
}): { kind: "ready"; attempt: HeldItemReview } | { kind: "invalid"; field: keyof ReviewInput } {
  const result = adminItemReviewInput.safeParse({ decision, reason });
  if (!result.success) {
    const field = result.error.issues[0]?.path[0] === "decision" ? "decision" : "reason";
    return { kind: "invalid", field };
  }
  const next = { itemId, expectedSessionId, input: result.data };
  if (previous && isSameReview(previous, next)) return { kind: "ready", attempt: previous };
  return { kind: "ready", attempt: { ...next, key: crypto.randomUUID() } };
}

async function readReviewError(response: Response): Promise<ReviewResult> {
  if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
  if (response.status === 404) return { kind: "stale" };
  if (response.status !== 409) return { kind: "error" };
  const problem = problemResponseSchema.safeParse(await response.json());
  if (!problem.success) return { kind: "error" };
  if (problem.data.code === "invalid_status") return { kind: "stale" };
  if (problem.data.code === "session_changed") return { kind: "session-changed" };
  return { kind: "error" };
}

export async function reviewHeldMenuItem({
  itemId,
  expectedSessionId,
  input,
  key,
}: HeldItemReview): Promise<ReviewResult> {
  try {
    const response = await fetch(`${endpoint}/${encodeURIComponent(itemId)}/review`, {
      ...requestOptions,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Expected-Session-Id": expectedSessionId,
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) return await readReviewError(response);
    const result = adminItemReviewOutput.safeParse(await response.json());
    const status = input.decision === "approve" ? "approved" : "rejected";
    const isEcho = result.success && result.data.itemId === itemId;
    return isEcho && result.data.moderationStatus === status ? { kind: status } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
