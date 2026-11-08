import { adminBillingSettingsInput, adminBillingSettingsOutput } from "@zaafran/contracts/billing";
import { problemResponseSchema } from "@zaafran/contracts/health";

// BIL-01 / ADM-08 billing settings. Route requested in docs/requests/lane-b-billing.md.

type Output = ReturnType<typeof adminBillingSettingsOutput.parse>;
export type BillingSettings = Output["settings"];
export type SettingsDraft = {
  priceDzd: string;
  trialDays: string;
  dueDays: string;
  graceDays: string;
  taxRatePercent: string;
  companyName: string;
  companyAddress: string;
  registrationNumber: string;
  taxId: string;
  isOnlinePaymentEnabled: boolean;
  reason: string;
};
export type SettingsLoad =
  | { kind: "ready"; sessionId: string; settings: BillingSettings }
  | { kind: "sign-in" }
  | { kind: "error" };
export type SettingsSave =
  | { kind: "saved"; settings: BillingSettings }
  | { kind: "invalid"; field: string }
  | { kind: "sign-in" | "session-changed" | "error" };

const endpoint = "/v1/admin/billing/settings";
const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

export async function loadBillingSettings(signal?: AbortSignal): Promise<SettingsLoad> {
  try {
    const response = await fetch(endpoint, { ...requestOptions, ...(signal && { signal }) });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (!response.ok) return { kind: "error" };
    const output = adminBillingSettingsOutput.safeParse(await response.json());
    if (!output.success) return { kind: "error" };
    return { kind: "ready", sessionId: output.data.sessionId, settings: output.data.settings };
  } catch {
    return { kind: "error" };
  }
}

export function settingsToDraft(settings: BillingSettings): SettingsDraft {
  const legal = settings.legalDetails;
  return {
    priceDzd: String(settings.priceDzd),
    trialDays: String(settings.trialDays),
    dueDays: String(settings.dueDays),
    graceDays: String(settings.graceDays),
    taxRatePercent: String(settings.taxRateBasisPoints / 100),
    companyName: legal?.companyName ?? "",
    companyAddress: legal?.companyAddress ?? "",
    registrationNumber: legal?.registrationNumber ?? "",
    taxId: legal?.taxId ?? "",
    isOnlinePaymentEnabled: settings.subscriptionOnlinePaymentEnabled,
    reason: "",
  };
}

/** Parses a plain decimal; anything else (exponents, spaces, empty) becomes NaN for zod. */
function toNumber(value: string): number {
  const trimmed = value.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function optional(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function legalDetails(draft: SettingsDraft) {
  const isEmpty = [
    draft.companyName,
    draft.companyAddress,
    draft.registrationNumber,
    draft.taxId,
  ].every((value) => value.trim() === "");
  if (isEmpty) return null;
  return {
    companyName: draft.companyName,
    companyAddress: draft.companyAddress,
    registrationNumber: optional(draft.registrationNumber),
    taxId: optional(draft.taxId),
  };
}

/** Converts the form draft into the contract input; percent → basis points without float drift. */
export function draftToInput(draft: SettingsDraft) {
  const taxPercent = toNumber(draft.taxRatePercent);
  return adminBillingSettingsInput.safeParse({
    reason: draft.reason,
    settings: {
      priceDzd: toNumber(draft.priceDzd),
      trialDays: toNumber(draft.trialDays),
      dueDays: toNumber(draft.dueDays),
      graceDays: toNumber(draft.graceDays),
      taxRateBasisPoints: Number.isNaN(taxPercent) ? taxPercent : Math.round(taxPercent * 100),
      legalDetails: legalDetails(draft),
      subscriptionOnlinePaymentEnabled: draft.isOnlinePaymentEnabled,
    },
  });
}

function fieldOf(path: readonly PropertyKey[]): string {
  const last = path.at(-1);
  return typeof last === "string" ? last : "settings";
}

async function readSaveResponse(response: Response): Promise<SettingsSave> {
  if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
  if (response.status === 409) {
    const problem = problemResponseSchema.safeParse(await response.json());
    const isSessionChange = problem.success && problem.data.code === "session_changed";
    return { kind: isSessionChange ? "session-changed" : "error" };
  }
  if (!response.ok) return { kind: "error" };
  const output = adminBillingSettingsOutput.safeParse(await response.json());
  return output.success ? { kind: "saved", settings: output.data.settings } : { kind: "error" };
}

export async function saveBillingSettings(input: {
  draft: SettingsDraft;
  expectedSessionId: string;
  key: string;
}): Promise<SettingsSave> {
  const parsed = draftToInput(input.draft);
  if (!parsed.success)
    return { kind: "invalid", field: fieldOf(parsed.error.issues[0]?.path ?? []) };
  try {
    const response = await fetch(endpoint, {
      ...requestOptions,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": input.key,
        "X-Expected-Session-Id": input.expectedSessionId,
      },
      body: JSON.stringify(parsed.data),
    });
    return await readSaveResponse(response);
  } catch {
    return { kind: "error" };
  }
}
