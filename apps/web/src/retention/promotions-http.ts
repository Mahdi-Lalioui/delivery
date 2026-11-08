import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantPromotionListOutput,
  merchantPromotionOutput,
} from "@zaafran/contracts/promotions";
import type { PromotionInput } from "./promotion-draft";

// MER-19 promotions client on lane A's routes (docs/requests/lane-a-backend-batch.md). The list is a
// session-bound envelope; writes send X-Expected-Session-Id with the session read from it.

export type Promotion = ReturnType<typeof merchantPromotionOutput.parse>;
export type PromotionList =
  | { kind: "ready"; sessionId: string; promotions: Promotion[] }
  | { kind: "sign-in" | "not-found" | "error" };
export type PromotionSave =
  | { kind: "saved"; promotion: Promotion }
  | { kind: "duplicate-code" | "session-changed" | "sign-in" | "error" };

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function path(merchantId: string, promotionId?: string): string {
  const base = `/v1/merchants/${encodeURIComponent(merchantId)}/promotions`;
  return promotionId === undefined ? base : `${base}/${encodeURIComponent(promotionId)}`;
}

export async function listPromotions(
  merchantId: string,
  signal?: AbortSignal,
): Promise<PromotionList> {
  try {
    const response = await fetch(path(merchantId), {
      ...requestOptions,
      ...(signal && { signal }),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 404) return { kind: "not-found" };
    if (!response.ok) return { kind: "error" };
    const output = merchantPromotionListOutput.safeParse(await response.json());
    if (!output.success) return { kind: "error" };
    const isOwn = output.data.promotions.every((promotion) => promotion.merchantId === merchantId);
    return isOwn ? { kind: "ready", ...output.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

async function conflictKind(response: Response): Promise<PromotionSave> {
  const problem = problemResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (!problem.success) return { kind: "error" };
  if (problem.data.code === "promotion_code_taken") return { kind: "duplicate-code" };
  return { kind: problem.data.code === "session_changed" ? "session-changed" : "error" };
}

/** Creates a promotion, or replaces one when `promotionId` is given. */
export async function savePromotion(input: {
  merchantId: string;
  promotionId?: string | undefined;
  promotion: PromotionInput;
  expectedSessionId: string;
  key: string;
}): Promise<PromotionSave> {
  try {
    const response = await fetch(path(input.merchantId, input.promotionId), {
      ...requestOptions,
      method: input.promotionId === undefined ? "POST" : "PUT",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": input.key,
        "X-Expected-Session-Id": input.expectedSessionId,
      },
      body: JSON.stringify(input.promotion),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 409) return await conflictKind(response);
    if (!response.ok) return { kind: "error" };
    const output = merchantPromotionOutput.safeParse(await response.json());
    return output.success && output.data.merchantId === input.merchantId
      ? { kind: "saved", promotion: output.data }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
