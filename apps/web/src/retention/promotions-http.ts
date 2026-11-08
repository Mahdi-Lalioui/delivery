import { merchantPromotionOutput } from "@zaafran/contracts/promotions";
import type { PromotionInput } from "./promotion-draft";

// MER-19 promotions client. The contract has no list envelope yet: lane B parses an array of
// `merchantPromotionOutput` (requested in docs/requests/lane-b-promotions.md).

export type Promotion = ReturnType<typeof merchantPromotionOutput.parse>;
export type PromotionList =
  { kind: "ready"; promotions: Promotion[] } | { kind: "sign-in" | "not-found" | "error" };
export type PromotionSave =
  { kind: "saved"; promotion: Promotion } | { kind: "duplicate-code" | "sign-in" | "error" };

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function path(merchantId: string, promotionId?: string): string {
  const base = `/v1/merchants/${encodeURIComponent(merchantId)}/promotions`;
  return promotionId === undefined ? base : `${base}/${encodeURIComponent(promotionId)}`;
}

function parseList(body: unknown, merchantId: string): Promotion[] | undefined {
  if (!Array.isArray(body) || body.length > 100) return undefined;
  const promotions: Promotion[] = [];
  for (const item of body) {
    const parsed = merchantPromotionOutput.safeParse(item);
    if (!parsed.success || parsed.data.merchantId !== merchantId) return undefined;
    promotions.push(parsed.data);
  }
  return promotions;
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
    const promotions = parseList(await response.json(), merchantId);
    return promotions === undefined ? { kind: "error" } : { kind: "ready", promotions };
  } catch {
    return { kind: "error" };
  }
}

/** Creates a promotion, or replaces one when `promotionId` is given. */
export async function savePromotion(input: {
  merchantId: string;
  promotionId?: string | undefined;
  promotion: PromotionInput;
  key: string;
}): Promise<PromotionSave> {
  try {
    const response = await fetch(path(input.merchantId, input.promotionId), {
      ...requestOptions,
      method: input.promotionId === undefined ? "POST" : "PUT",
      headers: { "Content-Type": "application/json", "Idempotency-Key": input.key },
      body: JSON.stringify(input.promotion),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 409) return { kind: "duplicate-code" };
    if (!response.ok) return { kind: "error" };
    const output = merchantPromotionOutput.safeParse(await response.json());
    return output.success && output.data.merchantId === input.merchantId
      ? { kind: "saved", promotion: output.data }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
