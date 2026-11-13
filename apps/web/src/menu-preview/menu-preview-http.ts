import { menuPreviewOutput } from "@zaafran/contracts/menu-preview";
import type { MerchantRead } from "../merchant/merchant-http";

export type MenuPreview = ReturnType<typeof menuPreviewOutput.parse>;

export async function loadMenuPreview({
  merchantId,
  signal,
}: {
  merchantId: string;
  signal: AbortSignal;
}): Promise<MerchantRead<MenuPreview>> {
  try {
    const response = await fetch(`/v1/merchants/${encodeURIComponent(merchantId)}/menu/preview`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
    });

    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error" };

    const result = menuPreviewOutput.safeParse(await response.json());
    return result.success ? { kind: "ready", data: result.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
