import { sessionIdParams, sessionListOutput, type logoutInput } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";

export type DeviceSession = ReturnType<typeof sessionListOutput.parse>["sessions"][number];
export type LogoutScope = ReturnType<typeof logoutInput.parse>["scope"];
export type LogoutAttempt = ReturnType<typeof logoutInput.parse> & { idempotencyKey: string };
export type DeviceList =
  | { kind: "ready"; sessions: DeviceSession[] }
  | { kind: "unauthenticated" }
  | { kind: "load-error" };

type MutationResult = "success" | "unauthenticated" | "missing" | "session-changed" | "error";

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

export async function listDevices(signal: AbortSignal): Promise<DeviceList> {
  try {
    const response = await fetch("/v1/me/sessions", { ...requestOptions, method: "GET", signal });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (!response.ok) return { kind: "load-error" };

    const payload: unknown = await response.json();
    const result = sessionListOutput.safeParse(payload);
    return result.success
      ? { kind: "ready", sessions: result.data.sessions }
      : { kind: "load-error" };
  } catch {
    return { kind: "load-error" };
  }
}

async function mutateDevice(path: string, options: RequestInit): Promise<MutationResult> {
  try {
    const response = await fetch(path, { ...options, ...requestOptions });
    const { status } = response;
    if (status === 204) return "success";
    if (status === 401) return "unauthenticated";
    if (status === 404 && options.method === "DELETE") return "missing";
    if (status === 409 && options.method === "POST") return await readLogoutConflict(response);
    return "error";
  } catch {
    return "error";
  }
}

async function readLogoutConflict(response: Response): Promise<MutationResult> {
  const payload: unknown = await response.json();
  const problem = problemResponseSchema.safeParse(payload);
  return problem.success &&
    problem.data.status === response.status &&
    problem.data.code === "session_changed"
    ? "session-changed"
    : "error";
}

export async function revokeDevice(sessionId: string): Promise<MutationResult> {
  if (!sessionIdParams.safeParse({ sessionId }).success) return "error";
  return mutateDevice(`/v1/me/sessions/${sessionId}`, { method: "DELETE" });
}

export function signOutDevices({
  scope,
  expectedSessionId,
  idempotencyKey,
}: LogoutAttempt): Promise<MutationResult> {
  return mutateDevice("/v1/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ scope, expectedSessionId }),
  });
}
