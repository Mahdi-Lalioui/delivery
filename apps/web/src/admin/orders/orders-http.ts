import {
  adminOrderDetailOutput,
  adminOrderSearchOutput,
  type adminOrderSearchInput,
} from "@zaafran/contracts/admin-orders";
import { orderSummary, type orderActionInputs } from "@zaafran/contracts/orders";
import type { MerchantRead } from "../../merchant/merchant-http";

export type AdminOrderPage = ReturnType<typeof adminOrderSearchOutput.parse>;
export type AdminOrder = AdminOrderPage["orders"][number];
export type OrderQuery = ReturnType<typeof adminOrderSearchInput.parse>;
export type OrderDetail = ReturnType<typeof adminOrderDetailOutput.parse>;
type ForceInput = ReturnType<typeof orderActionInputs.force.parse>;
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

const options = {
  cache: "no-store",
  credentials: "same-origin",
  redirect: "error",
} satisfies RequestInit;

async function request<T>(
  path: string,
  { signal, ...init }: RequestInit,
  schema: Schema<T>,
): Promise<MerchantRead<T>> {
  try {
    const deadline = AbortSignal.timeout(15_000);
    const response = await fetch(path, {
      ...options,
      ...init,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error" };
    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);
    return parsed.success ? { kind: "ready", data: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export function searchAdminOrders(input: OrderQuery, signal: AbortSignal) {
  return request(
    "/v1/admin/orders/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    },
    adminOrderSearchOutput,
  );
}

export async function readOrderTimeline({
  orderId,
  sessionId,
  signal,
}: {
  orderId: string;
  sessionId: string;
  signal: AbortSignal;
}): Promise<MerchantRead<OrderDetail>> {
  const result = await request(
    `/v1/admin/orders/${encodeURIComponent(orderId)}/timeline`,
    {
      signal,
    },
    adminOrderDetailOutput,
  );
  if (result.kind === "ready" && result.data.sessionId !== sessionId)
    return { kind: "unauthenticated" };
  return result;
}

export async function forceOrder({
  orderId,
  sessionId,
  key,
  input,
}: {
  orderId: string;
  sessionId: string;
  key: string;
  input: ForceInput;
}): Promise<"saved" | "stale" | "error"> {
  try {
    const response = await fetch(`/v1/orders/${encodeURIComponent(orderId)}/force`, {
      ...options,
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Expected-Session-Id": sessionId,
      },
      body: JSON.stringify(input),
    });
    if (response.status === 409 || response.status === 401 || response.status === 403)
      return "stale";
    if (!response.ok) return "error";
    const body: unknown = await response.json();
    const parsed = orderSummary.safeParse(body);
    return parsed.success && parsed.data.orderId === orderId ? "saved" : "error";
  } catch {
    return "error";
  }
}
