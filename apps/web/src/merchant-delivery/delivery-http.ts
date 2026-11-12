import {
  merchantDeliverySettingsOutput,
  merchantDeliverySettingsWriteOutput,
} from "@zaafran/contracts/merchant-delivery";
import type { MerchantRead } from "../merchant/merchant-http";

export type DeliverySnapshot = ReturnType<typeof merchantDeliverySettingsOutput.parse>;
const privateRequest = {
  cache: "no-store",
  credentials: "same-origin",
  redirect: "error",
} satisfies RequestInit;

function endpoint(merchantId: string) {
  return "/v1/merchants/" + encodeURIComponent(merchantId) + "/delivery-settings";
}

export async function readDeliverySettings(
  merchantId: string,
  signal: AbortSignal,
): Promise<MerchantRead<DeliverySnapshot>> {
  try {
    const response = await fetch(endpoint(merchantId), {
      ...privateRequest,
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error" };
    const body: unknown = await response.json();
    const parsed = merchantDeliverySettingsOutput.safeParse(body);
    return parsed.success ? { kind: "ready", data: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

type Save = { kind: "saved"; revision: number } | { kind: "stale" | "error" };

export async function saveDeliverySettings({
  merchantId,
  sessionId,
  key,
  body,
}: {
  merchantId: string;
  sessionId: string;
  key: string;
  body: string;
}): Promise<Save> {
  try {
    const response = await fetch(endpoint(merchantId), {
      ...privateRequest,
      method: "PUT",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Expected-Session-Id": sessionId,
      },
      body,
    });
    if (response.status === 409 || response.status === 401 || response.status === 403)
      return { kind: "stale" };
    if (!response.ok) return { kind: "error" };
    const payload: unknown = await response.json();
    const parsed = merchantDeliverySettingsWriteOutput.safeParse(payload);
    return parsed.success ? { kind: "saved", revision: parsed.data.revision } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
