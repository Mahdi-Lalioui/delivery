import type { listStaff, revokeStaffInvitation, sendStaffInvitation } from "./staff-http";

type ListResult = Awaited<ReturnType<typeof listStaff>>;
type StaffList = Extract<ListResult, { kind: "ready" }>["list"];
type InviteResult = Awaited<ReturnType<typeof sendStaffInvitation>>;
type RevokeResult = Awaited<ReturnType<typeof revokeStaffInvitation>>;

export type StaffNotice =
  | "invited"
  | "revoked"
  | "stale"
  | "already-member"
  | "already-invited"
  | "delivery-unavailable"
  | "invite-error"
  | "revoke-error";

export type StaffState =
  | { readonly kind: "loading" | "sign-in" | "not-found" | "error" | "session-changed" }
  | {
      readonly kind: "ready";
      readonly list: StaffList;
      readonly pending?: "invite" | { readonly invitationId: string };
      readonly notice?: StaffNotice;
    };

type ReadyStaff = Extract<StaffState, { kind: "ready" }>;

export type StaffEvent =
  | { readonly kind: "reload" }
  | { readonly kind: "loaded"; readonly result: ListResult }
  | { readonly kind: "invite-started" }
  | { readonly kind: "invite-finished"; readonly result: InviteResult }
  | { readonly kind: "revoke-started"; readonly invitationId: string }
  | {
      readonly kind: "revoke-finished";
      readonly invitationId: string;
      readonly result: RevokeResult;
    };

export const initialStaffState: StaffState = { kind: "loading" };

const inviteNotices: Readonly<Record<InviteResult["kind"], StaffNotice | undefined>> = {
  invited: "invited",
  "already-member": "already-member",
  "already-invited": "already-invited",
  "delivery-unavailable": "delivery-unavailable",
  error: "invite-error",
  "not-found": "invite-error",
  "sign-in": undefined,
  "session-changed": undefined,
};

function settle(state: ReadyStaff, notice: StaffNotice, list = state.list): StaffState {
  return { kind: "ready", list, notice };
}

function finishInvite(state: StaffState, result: InviteResult): StaffState {
  if (state.kind !== "ready" || state.pending !== "invite") return state;
  const notice = inviteNotices[result.kind];
  return notice
    ? settle(state, notice)
    : { kind: result.kind === "sign-in" ? "sign-in" : "session-changed" };
}

function finishRevoke(state: StaffState, invitationId: string, result: RevokeResult): StaffState {
  if (state.kind !== "ready" || typeof state.pending !== "object") return state;
  if (state.pending.invitationId !== invitationId) return state;
  switch (result.kind) {
    case "revoked": {
      const invitations = state.list.invitations.filter((i) => i.invitationId !== invitationId);
      return settle(state, "revoked", { ...state.list, invitations });
    }
    case "stale":
      return settle(state, "stale");
    case "sign-in":
    case "session-changed":
      return { kind: result.kind };
    case "not-found":
    case "error":
      return settle(state, "revoke-error");
  }
}

function load(state: StaffState, result: ListResult): StaffState {
  if (result.kind !== "ready") return { kind: result.kind };
  // A re-read after a command keeps that command's notice.
  const notice = state.kind === "ready" ? state.notice : undefined;
  return { kind: "ready", list: result.list, ...(notice && { notice }) };
}

function isIdle(state: StaffState): state is ReadyStaff {
  return state.kind === "ready" && !state.pending;
}

function start(state: StaffState, pending: NonNullable<ReadyStaff["pending"]>): StaffState {
  return isIdle(state) ? { kind: "ready", list: state.list, pending } : state;
}

/** MER-23: the owner's staff list with one invite or revoke command in flight at a time. */
export function reduceStaff(state: StaffState, event: StaffEvent): StaffState {
  switch (event.kind) {
    case "reload":
      // A command in flight finishes first, so its result is not lost.
      return state.kind === "ready" && !isIdle(state) ? state : initialStaffState;
    case "loaded":
      return load(state, event.result);
    case "invite-started":
      return start(state, "invite");
    case "invite-finished":
      return finishInvite(state, event.result);
    case "revoke-started":
      return start(state, { invitationId: event.invitationId });
    case "revoke-finished":
      return finishRevoke(state, event.invitationId, event.result);
  }
}

export type StaffRevokeAttempt = Readonly<{ invitationId: string; sessionId: string; key: string }>;

/** Reuses the key of an uncertain revoke only for the same invitation in the same session. */
export function staffRevokeKey(
  previous: StaffRevokeAttempt | undefined,
  target: { invitationId: string; sessionId: string },
  createKey: () => string,
): StaffRevokeAttempt {
  const isSame =
    previous?.invitationId === target.invitationId && previous.sessionId === target.sessionId;
  return previous && isSame ? previous : { ...target, key: createKey() };
}
