import { addressInput, addressListOutput, addressOutput } from "@zaafran/contracts/addresses";
import type { orderPlacementInput, orderQuoteInput } from "@zaafran/contracts/orders";
import { orderQuoteOutput, orderSummary } from "@zaafran/contracts/orders";
import type { Cart } from "@zaafran/domain/cart";

// CUS-13 / CUS-14 / ORD-01 checkout client on lane A's published order and address contracts
// (docs/AWID_CONTRACTS.md). Placement and quotes always send an Idempotency-Key.

export type Address = ReturnType<typeof addressOutput.parse>;
export type AddressDraft = ReturnType<typeof addressInput.parse>;
export type Quote = ReturnType<typeof orderQuoteOutput.parse>;
export type PlacedOrder = ReturnType<typeof orderSummary.parse>;
type QuoteInput = ReturnType<typeof orderQuoteInput.parse>;
type Placement = ReturnType<typeof orderPlacementInput.parse>;

export type Fulfilment = { fulfilment: "pickup" } | { fulfilment: "delivery"; addressId: string };
export type Timing = QuoteInput["timing"];
export type AddressLoad = { kind: "ready"; addresses: Address[] } | { kind: "sign-in" | "error" };
export type QuoteResult =
  { kind: "ready"; quote: Quote } | { kind: "sign-in" | "unavailable" | "error" };
export type PlaceResult =
  { kind: "placed"; order: PlacedOrder } | { kind: "sign-in" | "expired" | "error" };

const base = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function post(body: unknown, key?: string): RequestInit {
  return {
    ...base,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key && { "Idempotency-Key": key }) },
    body: JSON.stringify(body),
  };
}

function isAuthFailure(status: number) {
  return status === 401 || status === 403;
}

/** Builds the quote request from the browser cart; prices are always computed by the server. */
export function toQuoteInput(cart: Cart, fulfilment: Fulfilment, timing: Timing): QuoteInput {
  return {
    merchantId: cart.merchant.merchantId,
    ...fulfilment,
    timing,
    items: cart.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      optionIds: line.options.map((option) => option.optionId),
      ...(line.note.trim() !== "" && { note: line.note.trim() }),
    })),
  };
}

export async function loadAddresses(signal?: AbortSignal): Promise<AddressLoad> {
  try {
    const response = await fetch("/v1/me/addresses", { ...base, ...(signal && { signal }) });
    if (isAuthFailure(response.status)) return { kind: "sign-in" };
    if (!response.ok) return { kind: "error" };
    const parsed = addressListOutput.safeParse(await response.json());
    return parsed.success ? { kind: "ready", addresses: parsed.data.addresses } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function saveAddress(
  draft: AddressDraft,
  key: string,
): Promise<{ kind: "saved"; address: Address } | { kind: "sign-in" | "invalid" | "error" }> {
  const input = addressInput.safeParse(draft);
  if (!input.success) return { kind: "invalid" };
  try {
    const response = await fetch("/v1/me/addresses", post(input.data, key));
    if (isAuthFailure(response.status)) return { kind: "sign-in" };
    if (response.status === 400 || response.status === 422) return { kind: "invalid" };
    if (!response.ok) return { kind: "error" };
    const parsed = addressOutput.safeParse(await response.json());
    return parsed.success ? { kind: "saved", address: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function requestQuote(input: QuoteInput, signal?: AbortSignal): Promise<QuoteResult> {
  try {
    const response = await fetch("/v1/quotes", { ...post(input), ...(signal && { signal }) });
    if (isAuthFailure(response.status)) return { kind: "sign-in" };
    if (response.status === 409 || response.status === 422) return { kind: "unavailable" };
    if (!response.ok) return { kind: "error" };
    const parsed = orderQuoteOutput.safeParse(await response.json());
    return parsed.success ? { kind: "ready", quote: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** Places the order; retry with the same key and body after a lost response (ORD-01). */
export async function placeOrder(placement: Placement, key: string): Promise<PlaceResult> {
  try {
    const response = await fetch("/v1/orders", post(placement, key));
    if (isAuthFailure(response.status)) return { kind: "sign-in" };
    if (response.status === 409 || response.status === 410) return { kind: "expired" };
    if (!response.ok) return { kind: "error" };
    const parsed = orderSummary.safeParse(await response.json());
    return parsed.success ? { kind: "placed", order: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
