import { merchantOnboardingOutput } from "@zaafran/contracts/merchant";
import type { MerchantRead } from "../merchant/merchant-http";

export type MerchantOnboarding = ReturnType<typeof merchantOnboardingOutput.parse>;

export async function loadMerchantOnboarding({
  merchantId,
  signal,
}: {
  merchantId: string;
  signal: AbortSignal;
}): Promise<MerchantRead<MerchantOnboarding>> {
  try {
    const response = await fetch(`/v1/merchants/${encodeURIComponent(merchantId)}/onboarding`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
    });

    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error" };

    const payload: unknown = await response.json();
    const result = merchantOnboardingOutput.safeParse(payload);
    if (!result.success || result.data.merchantId.toLowerCase() !== merchantId.toLowerCase()) {
      return { kind: "error" };
    }

    return { kind: "ready", data: result.data };
  } catch {
    return { kind: "error" };
  }
}
