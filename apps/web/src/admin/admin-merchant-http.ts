import {
  adminMerchantReviewInput,
  adminMerchantReviewOutput,
  adminReviewQueueOutput,
  readAdminReviewCursor,
} from "@zaafran/contracts/admin";
import { problemResponseSchema } from "@zaafran/contracts/health";

type ReviewPage = ReturnType<typeof adminReviewQueueOutput.parse>;
export type AdminApplication = ReviewPage["applications"][number];
type ReviewInput = ReturnType<typeof adminMerchantReviewInput.parse>;
export type ReviewDecision = ReviewInput["decision"];
export type ReviewValidationField = keyof ReviewInput;
export type ReviewAttempt = Readonly<{
  merchantId: string;
  expectedSessionId: string;
  input: ReviewInput;
  key: string;
}>;
export type QueuePageRequest =
  { cursor?: never; expectedSessionId?: never } | { cursor: string; expectedSessionId: string };
type QueueResult =
  { kind: "ready"; page: ReviewPage } | { kind: "sign-in" | "session-changed" | "error" };
type ReviewResult = {
  kind: "approved" | "rejected" | "sign-in" | "session-changed" | "stale" | "error";
};

const queuePath = "/v1/admin/merchant-applications";
const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

async function readQueuePage(
  response: Response,
  { cursor, expectedSessionId }: QueuePageRequest,
): Promise<QueueResult> {
  const payload: unknown = await response.json();
  const result = adminReviewQueueOutput.safeParse(payload);
  if (!result.success) return { kind: "error" };
  const { nextCursor, sessionId } = result.data;
  if (expectedSessionId !== undefined && sessionId !== expectedSessionId) {
    return { kind: "session-changed" };
  }
  if (nextCursor !== null && (!readAdminReviewCursor(nextCursor) || cursor === nextCursor)) {
    return { kind: "error" };
  }
  return { kind: "ready", page: result.data };
}

export async function listAdminMerchantApplications(
  request: QueuePageRequest & { signal?: AbortSignal },
): Promise<QueueResult> {
  const { cursor, signal } = request;
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);

  try {
    const response = await fetch(queuePath + "?" + query.toString(), {
      ...requestOptions,
      method: "GET",
      ...(signal && { signal }),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (!response.ok) return { kind: "error" };
    return await readQueuePage(response, request);
  } catch {
    return { kind: "error" };
  }
}

export function prepareAdminReviewAttempt({
  merchantId,
  expectedSessionId,
  decision,
  reason,
  previous,
}: {
  merchantId: string;
  expectedSessionId: string;
  decision: ReviewDecision | "";
  reason: string;
  previous?: ReviewAttempt | undefined;
}): { kind: "ready"; attempt: ReviewAttempt } | { kind: "invalid"; field: ReviewValidationField } {
  const result = adminMerchantReviewInput.safeParse({ decision, reason });
  if (!result.success) {
    const field = result.error.issues[0]?.path[0] === "decision" ? "decision" : "reason";
    return { kind: "invalid", field };
  }
  const input = result.data;
  if (
    previous?.merchantId === merchantId &&
    previous.expectedSessionId === expectedSessionId &&
    previous.input.decision === input.decision &&
    previous.input.reason === input.reason
  ) {
    return { kind: "ready", attempt: previous };
  }
  return {
    kind: "ready",
    attempt: { merchantId, expectedSessionId, input, key: crypto.randomUUID() },
  };
}

async function readReviewError(response: Response): Promise<ReviewResult> {
  if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
  if (response.status === 404) return { kind: "stale" };
  if (response.status !== 409) return { kind: "error" };

  const payload: unknown = await response.json();
  const problem = problemResponseSchema.safeParse(payload);
  if (!problem.success || problem.data.status !== 409) return { kind: "error" };
  if (problem.data.code === "invalid_status") return { kind: "stale" };
  if (problem.data.code === "session_changed") return { kind: "session-changed" };
  return { kind: "error" };
}

export async function reviewAdminMerchantApplication({
  merchantId,
  expectedSessionId,
  input,
  key,
}: ReviewAttempt): Promise<ReviewResult> {
  try {
    const response = await fetch(queuePath + "/" + encodeURIComponent(merchantId) + "/review", {
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

    const payload: unknown = await response.json();
    const result = adminMerchantReviewOutput.safeParse(payload);
    const status = input.decision === "approve" ? "approved" : "rejected";
    if (result.success && result.data.merchantId === merchantId && result.data.status === status) {
      return { kind: status };
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
