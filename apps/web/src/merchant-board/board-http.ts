import { courierInviteOutput, courierRosterOutput } from "@zaafran/contracts/courier";
import type { orderActionInputs } from "@zaafran/contracts/orders";
import { merchantBoardOutput, orderSummary } from "@zaafran/contracts/orders";
import type { MerchantRead } from "../merchant/merchant-http";

export type Board = ReturnType<typeof merchantBoardOutput.parse>;
export type CourierRoster = ReturnType<typeof courierRosterOutput.parse>["couriers"];
export type Ticket = Board["orders"][number];
export type RejectReason = ReturnType<typeof orderActionInputs.reject.parse>["reason"];
export type BoardAction =
  | { kind: "accept"; prepMinutes: number }
  | { kind: "reject"; reason: RejectReason; soldOutItemIds: string[] }
  | { kind: "cancel"; reason: string }
  | { kind: "assign"; courierId: string }
  | { kind: "ready" | "collect" | "pick-up" };

type BoardRequest = { merchantId: string; after?: string | undefined; signal: AbortSignal };
type ActionRequest = { orderId: string; key: string; expectedVersion: number; action: BoardAction };

const options = { cache: "no-store", credentials: "same-origin", redirect: "error" } as const;

export async function readBoard({
  merchantId,
  after,
  signal,
}: BoardRequest): Promise<MerchantRead<Board>> {
  const path = `/v1/merchants/${encodeURIComponent(merchantId)}/order-board`;
  const url = after === undefined ? path : path + "?after=" + encodeURIComponent(after);
  try {
    const response = await fetch(url, { ...options, signal });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error" };
    const parsed = merchantBoardOutput.safeParse(await response.json());
    return parsed.success ? { kind: "ready", data: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function submitBoardAction({ orderId, key, expectedVersion, action }: ActionRequest) {
  const { kind, ...fields } = action;
  try {
    const response = await fetch(`/v1/orders/${encodeURIComponent(orderId)}/${kind}`, {
      ...options,
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ expectedVersion, ...fields }),
    });
    if (response.status === 409) return "conflict";
    if (response.status >= 500 || response.status === 429) return "retry";
    if (!response.ok) return "error";
    return orderSummary.safeParse(await response.json()).success ? "saved" : "retry";
  } catch {
    return "retry";
  }
}

export async function readCourierRoster(merchantId: string, signal: AbortSignal) {
  try {
    const response = await fetch(`/v1/merchants/${merchantId}/couriers`, { ...options, signal });
    if (!response.ok) return undefined;
    const payload: unknown = await response.json();
    const roster = courierRosterOutput.safeParse(payload);
    return roster.success ? roster.data.couriers : undefined;
  } catch {
    return undefined;
  }
}

export async function inviteCourier(merchantId: string, phone: string) {
  try {
    const response = await fetch(`/v1/merchants/${merchantId}/couriers/invites`, {
      ...options,
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (response.status === 409) return { kind: "already" } as const;
    if (!response.ok) return { kind: "error" } as const;
    const payload: unknown = await response.json();
    const invitation = courierInviteOutput.safeParse(payload);
    return invitation.success
      ? ({ kind: "ready", data: invitation.data } as const)
      : ({ kind: "error" } as const);
  } catch {
    return { kind: "error" } as const;
  }
}
