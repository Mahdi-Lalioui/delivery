import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  staffInvitationAcceptInput,
  staffInvitationAcceptOutput,
  staffInvitationInput,
  staffInvitationOutput,
  staffListOutput,
  staffRevokeOutput,
} from "@zaafran/contracts/merchant-staff";
import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";

type StaffList = ReturnType<typeof staffListOutput.parse>;
type InvitationInput = ReturnType<typeof staffInvitationInput.parse>;
type Invitation = ReturnType<typeof staffInvitationOutput.parse>;
type Accepted = ReturnType<typeof staffInvitationAcceptOutput.parse>;
type Access = "sign-in" | "not-found" | "error";

export type StaffInvitationAttempt = Readonly<{
  merchantId: string;
  expectedSessionId: string;
  input: InvitationInput;
  key: string;
}>;

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function staffPath(merchantId: string) {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/staff`;
}

async function readProblemCode(response: Response): Promise<string | undefined> {
  const problem = problemResponseSchema.safeParse(await response.json().catch(() => undefined));
  return problem.success ? problem.data.code : undefined;
}

function readAccess(status: number): Access {
  if (status === 401 || status === 403) return "sign-in";
  if (status === 404) return "not-found";
  return "error";
}

function sessionCommand(attempt: { expectedSessionId: string; key: string }, body?: object) {
  const session = {
    "Idempotency-Key": attempt.key,
    "X-Expected-Session-Id": attempt.expectedSessionId,
  };
  // Fastify rejects an empty body declared as JSON, so a bodyless command omits the type.
  if (body === undefined) return { ...requestOptions, method: "POST", headers: session };
  return {
    ...requestOptions,
    method: "POST",
    headers: { "Content-Type": "application/json", ...session },
    body: JSON.stringify(body),
  };
}

/** MER-23: the owner's members and open invitations. */
export async function listStaff({
  merchantId,
}: {
  merchantId: string;
}): Promise<{ kind: "ready"; list: StaffList } | { kind: Access }> {
  try {
    const response = await fetch(staffPath(merchantId), { ...requestOptions, method: "GET" });
    if (!response.ok) return { kind: readAccess(response.status) };
    const result = staffListOutput.safeParse(await response.json());
    return result.success ? { kind: "ready", list: result.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** Validates the draft and reuses the previous key only for an identical retry. */
export function prepareStaffInvitation(draft: {
  merchantId: string;
  expectedSessionId: string;
  phone: string;
  role: InvitationInput["role"] | "";
  previous?: StaffInvitationAttempt | undefined;
}):
  | { kind: "ready"; attempt: StaffInvitationAttempt }
  | { kind: "invalid"; field: "phone" | "role" } {
  const phone = normalizeAlgerianPhone(draft.phone);
  const result = staffInvitationInput.safeParse({ phone, role: draft.role });
  if (!result.success) {
    const field = result.error.issues[0]?.path[0] === "role" ? "role" : "phone";
    return { kind: "invalid", field };
  }
  const { merchantId, expectedSessionId, previous } = draft;
  const isSame =
    previous?.merchantId === merchantId &&
    previous.expectedSessionId === expectedSessionId &&
    previous.input.phone === result.data.phone &&
    previous.input.role === result.data.role;
  if (previous && isSame) return { kind: "ready", attempt: previous };
  const attempt = { merchantId, expectedSessionId, input: result.data, key: crypto.randomUUID() };
  return { kind: "ready", attempt };
}

const invitationRefusals: ReadonlyMap<string, InvitationRefusal> = new Map([
  ["already_member", "already-member"],
  ["already_invited", "already-invited"],
  ["session_changed", "session-changed"],
  ["invitation_delivery_unavailable", "delivery-unavailable"],
]);
type InvitationRefusal =
  "already-member" | "already-invited" | "session-changed" | "delivery-unavailable";

export async function sendStaffInvitation(
  attempt: StaffInvitationAttempt,
): Promise<{ kind: "invited"; invitation: Invitation } | { kind: InvitationRefusal | Access }> {
  try {
    const url = `${staffPath(attempt.merchantId)}/invitations`;
    const response = await fetch(url, sessionCommand(attempt, attempt.input));
    if (!response.ok) {
      const refusal = invitationRefusals.get((await readProblemCode(response)) ?? "");
      return { kind: refusal ?? readAccess(response.status) };
    }
    const result = staffInvitationOutput.safeParse(await response.json());
    return result.success ? { kind: "invited", invitation: result.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function revokeStaffInvitation(request: {
  merchantId: string;
  invitationId: string;
  expectedSessionId: string;
  key: string;
}): Promise<{ kind: "revoked" | "stale" | "session-changed" | Access }> {
  const { merchantId, invitationId } = request;
  try {
    const url = `${staffPath(merchantId)}/invitations/${encodeURIComponent(invitationId)}/revoke`;
    const response = await fetch(url, sessionCommand(request));
    if (!response.ok) {
      const code = await readProblemCode(response);
      if (code === "already_consumed") return { kind: "stale" };
      if (code === "session_changed") return { kind: "session-changed" };
      return { kind: readAccess(response.status) };
    }
    const result = staffRevokeOutput.safeParse(await response.json());
    const isEcho = result.success && result.data.invitationId === invitationId;
    return { kind: isEcho ? "revoked" : "error" };
  } catch {
    return { kind: "error" };
  }
}

/** MER-23: the invitee, signed in with the invited phone, redeems the SMS token. */
export async function acceptStaffInvitation(
  token: string,
): Promise<{ kind: "accepted"; accepted: Accepted } | { kind: "already-member" | Access }> {
  const input = staffInvitationAcceptInput.safeParse({ token });
  if (!input.success) return { kind: "not-found" };
  try {
    const response = await fetch("/v1/staff-invitations/accept", {
      ...requestOptions,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
    });
    if (!response.ok) {
      const code = await readProblemCode(response);
      return { kind: code === "already_member" ? "already-member" : readAccess(response.status) };
    }
    const result = staffInvitationAcceptOutput.safeParse(await response.json());
    return result.success ? { kind: "accepted", accepted: result.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
