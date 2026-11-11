import { customerTrackingOutput } from "@zaafran/contracts/tracking";

// CUS-18 / CUS-19 customer tracking on lane A's published contract (docs/AWID_CONTRACTS.md).
// Polling every few seconds is the documented fallback; SSE replaces it once the order topic
// lands on main (docs/requests/lane-b-tracking.md).

export type Tracking = ReturnType<typeof customerTrackingOutput.parse>;
export type OrderStatus = Tracking["order"]["status"];
export type TrackingLoad =
  { kind: "ready"; tracking: Tracking } | { kind: "sign-in" | "not-found" | "error" };
type TimelineEntry = Tracking["timeline"][number];

const terminal: ReadonlySet<OrderStatus> = new Set([
  "delivered",
  "collected",
  "rejected",
  "expired",
  "cancelled",
  "delivery_failed",
]);

export function isTerminal(status: OrderStatus): boolean {
  return terminal.has(status);
}

export async function loadTracking(orderId: string, signal?: AbortSignal): Promise<TrackingLoad> {
  try {
    const response = await fetch(`/v1/orders/${encodeURIComponent(orderId)}/tracking`, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      ...(signal && { signal }),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 404) return { kind: "not-found" };
    if (!response.ok) return { kind: "error" };
    const parsed = customerTrackingOutput.safeParse(await response.json());
    return parsed.success && parsed.data.order.orderId === orderId
      ? { kind: "ready", tracking: parsed.data }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export type StepKey =
  "placed" | "accepted" | "ready" | "out_for_delivery" | "delivered" | "collected";
const statusOfStep: Readonly<Record<StepKey, readonly OrderStatus[]>> = {
  placed: ["pending_acceptance", "scheduled"],
  accepted: ["accepted"],
  ready: ["ready"],
  out_for_delivery: ["out_for_delivery"],
  delivered: ["delivered"],
  collected: ["collected"],
};

/** The customer-facing steps with the time each was reached, if it was. */
export function timelineSteps(
  fulfilment: Tracking["fulfilment"],
  timeline: readonly TimelineEntry[],
): { key: StepKey; at: string | undefined }[] {
  const keys: StepKey[] =
    fulfilment === "delivery"
      ? ["placed", "accepted", "ready", "out_for_delivery", "delivered"]
      : ["placed", "accepted", "ready", "collected"];
  return keys.map((key) => ({
    key,
    at: timeline.find((entry) => statusOfStep[key].includes(entry.status))?.at,
  }));
}

export const cancelReasons = ["changed_mind", "mistake", "address", "slow"] as const;
export type CancelResult = { kind: "cancelled" | "too-late" | "sign-in" | "error" };

/** CUS-19: cancel while the restaurant has not accepted; 409 means it is too late. */
export async function cancelOrder(input: {
  orderId: string;
  expectedVersion: number;
  reason: string;
  key: string;
}): Promise<CancelResult> {
  try {
    const response = await fetch(`/v1/orders/${encodeURIComponent(input.orderId)}/cancel`, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": input.key },
      body: JSON.stringify({ expectedVersion: input.expectedVersion, reason: input.reason }),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 409) return { kind: "too-late" };
    return { kind: response.ok ? "cancelled" : "error" };
  } catch {
    return { kind: "error" };
  }
}

export function canCancel(status: OrderStatus): boolean {
  return status === "scheduled" || status === "pending_acceptance";
}
