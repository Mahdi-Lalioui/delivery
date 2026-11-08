import {
  adminAuditOutput,
  adminFlagInput,
  adminFlagOutput,
  adminPlatformSettingInput,
  adminPlatformSettingsOutput,
  publicFlagsOutput,
} from "@zaafran/contracts/admin-ops";
import { problemResponseSchema } from "@zaafran/contracts/health";

// ADM-08 / ADM-09 platform client on lane A's routes (docs/requests/lane-a-backend-batch.md).
// Admin writes need a reason, an Idempotency-Key and the session read from GET /v1/admin/settings.

type Settings = ReturnType<typeof adminPlatformSettingsOutput.parse>["settings"];
type PublicFlags = ReturnType<typeof publicFlagsOutput.parse>;
type AuditEvent = ReturnType<typeof adminAuditOutput.parse>["events"][number];
export type AuditEntity = AuditEvent["entity"];
export type GlobalFlag = "menu_photo_import" | "online_payments" | "ramadan_mode";
export type SettingKey = Exclude<
  keyof Settings,
  "subscription_price_dzd" | "subscription_trial_days"
>;
export type PlatformSnapshot = {
  sessionId: string;
  settings: Settings;
  flags: Readonly<Record<GlobalFlag, boolean>>;
};
export type PlatformLoad = ({ kind: "ready" } & PlatformSnapshot) | { kind: "sign-in" | "error" };
export type PlatformWrite =
  { kind: "saved" } | { kind: "invalid" | "session-changed" | "sign-in" | "error" };
export type AuditPage =
  | { kind: "ready"; events: AuditEvent[]; nextCursor: string | null }
  | { kind: "sign-in" | "error" };

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

class AuthError extends Error {}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { ...requestOptions, ...(signal && { signal }) });
  if (response.status === 401 || response.status === 403) throw new AuthError();
  if (!response.ok) throw new Error(`platform ${path} ${String(response.status)}`);
  return response.json();
}

function flagsFrom(publicFlags: PublicFlags): PlatformSnapshot["flags"] {
  const { flags } = publicFlags;
  return {
    menu_photo_import: flags.menu_photo_import === true,
    online_payments: flags.online_payments === true,
    ramadan_mode: flags.ramadan_mode === true,
  };
}

export async function loadPlatform(signal?: AbortSignal): Promise<PlatformLoad> {
  try {
    const [settings, flags] = await Promise.all([
      getJson("/v1/admin/settings", signal),
      getJson("/v1/flags", signal),
    ]);
    const output = adminPlatformSettingsOutput.parse(settings);
    return {
      kind: "ready",
      sessionId: output.sessionId,
      settings: output.settings,
      flags: flagsFrom(publicFlagsOutput.parse(flags)),
    };
  } catch (error) {
    return { kind: error instanceof AuthError ? "sign-in" : "error" };
  }
}

type PutResult = { kind: "saved"; body: unknown } | Exclude<PlatformWrite, { kind: "saved" }>;

async function put(input: {
  path: string;
  body: unknown;
  key: string;
  expectedSessionId: string;
}): Promise<PutResult> {
  try {
    const response = await fetch(input.path, {
      ...requestOptions,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": input.key,
        "X-Expected-Session-Id": input.expectedSessionId,
      },
      body: JSON.stringify(input.body),
    });
    if (response.ok) return { kind: "saved", body: await response.json().catch(() => undefined) };
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 400 || response.status === 422) return { kind: "invalid" };
    if (response.status !== 409) return { kind: "error" };
    const problem = problemResponseSchema.safeParse(await response.json().catch(() => undefined));
    return {
      kind:
        problem.success && problem.data.code === "session_changed" ? "session-changed" : "error",
    };
  } catch {
    return { kind: "error" };
  }
}

/** ADM-08: one setting at a time, with the admin's reason (audited). */
export async function saveSetting(input: {
  key: SettingKey;
  value: unknown;
  reason: string;
  sessionId: string;
  idempotencyKey: string;
}): Promise<PlatformWrite> {
  const body = adminPlatformSettingInput.safeParse({ value: input.value, reason: input.reason });
  if (!body.success) return { kind: "invalid" };
  const result = await put({
    path: `/v1/admin/settings/${input.key}`,
    body: body.data,
    key: input.idempotencyKey,
    expectedSessionId: input.sessionId,
  });
  return result.kind === "saved" ? { kind: "saved" } : result;
}

/** ADM-08 kill switch; the response echoes the flag, so a mismatch is reported as an error. */
export async function saveFlag(input: {
  key: GlobalFlag;
  isEnabled: boolean;
  reason: string;
  sessionId: string;
  idempotencyKey: string;
}): Promise<PlatformWrite> {
  const body = adminFlagInput.safeParse({ isEnabled: input.isEnabled, reason: input.reason });
  if (!body.success) return { kind: "invalid" };
  const result = await put({
    path: `/v1/admin/flags/${input.key}`,
    body: body.data,
    key: input.idempotencyKey,
    expectedSessionId: input.sessionId,
  });
  if (result.kind !== "saved") return result;
  const echo = adminFlagOutput.safeParse(result.body);
  return echo.success && echo.data.key === input.key && echo.data.isEnabled === input.isEnabled
    ? { kind: "saved" }
    : { kind: "error" };
}

/** ADM-09: one keyset page of the audit log, optionally filtered by entity. */
export async function loadAudit(input: {
  entity?: AuditEntity | undefined;
  cursor?: string | undefined;
  signal?: AbortSignal | undefined;
}): Promise<AuditPage> {
  const query = new URLSearchParams({ limit: "50" });
  if (input.entity !== undefined) query.set("entity", input.entity);
  if (input.cursor !== undefined) query.set("cursor", input.cursor);
  try {
    const output = adminAuditOutput.parse(
      await getJson(`/v1/admin/audit?${query.toString()}`, input.signal),
    );
    if (input.cursor !== undefined && output.nextCursor === input.cursor) return { kind: "error" };
    return { kind: "ready", events: output.events, nextCursor: output.nextCursor };
  } catch (error) {
    return { kind: error instanceof AuthError ? "sign-in" : "error" };
  }
}
