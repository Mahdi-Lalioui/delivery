import { expect, test } from "vitest";
import {
  initialStaffState,
  reduceStaff,
  staffRevokeKey,
  type StaffState,
} from "../src/merchant-staff/staff-flow";

const merchantId = "019d6abc-1234-7234-8234-123456789def";
const sessionId = "019d6abc-1234-7234-8234-123456789aaa";
const invitationId = "019d6abc-1234-7234-8234-123456789bbb";
const otherInvitationId = "019d6abc-1234-7234-8234-123456789ccc";
const invitation = {
  invitationId,
  phoneE164: "+213550000282",
  role: "staff",
  createdAt: "2026-11-08T09:00:00.000Z",
  expiresAt: "2026-11-15T09:00:00.000Z",
} as const;
const list = {
  sessionId,
  merchantId,
  members: [
    {
      userId: "019d6abc-1234-7234-8234-123456789ddd",
      phoneE164: "+213550000281",
      role: "owner",
      isSelf: true,
    } as const,
  ],
  invitations: [invitation, { ...invitation, invitationId: otherInvitationId }],
};
const ready = { kind: "ready", list } satisfies StaffState;

test("[MER-23:web] loads the owner's list or the access outcome", () => {
  expect(initialStaffState).toEqual({ kind: "loading" });
  expect(
    reduceStaff(initialStaffState, { kind: "loaded", result: { kind: "ready", list } }),
  ).toEqual(ready);
  for (const kind of ["sign-in", "not-found", "error"] as const) {
    expect(reduceStaff(initialStaffState, { kind: "loaded", result: { kind } })).toEqual({ kind });
  }
});

test("[MER-23:web] keeps the invite notice across the re-read that follows a sent invitation", () => {
  const sending = reduceStaff(ready, { kind: "invite-started" });
  expect(sending).toEqual({ ...ready, pending: "invite" });
  expect(reduceStaff(sending, { kind: "invite-started" })).toBe(sending);

  const invited = reduceStaff(sending, {
    kind: "invite-finished",
    result: {
      kind: "invited",
      invitation: { ...invitation, merchantId, status: "pending" },
    },
  });
  expect(invited).toEqual({ ...ready, notice: "invited" });
  const reread = reduceStaff(invited, { kind: "loaded", result: { kind: "ready", list } });
  expect(reread).toEqual({ ...ready, notice: "invited" });
});

test.each([
  ["already-member", "already-member"],
  ["already-invited", "already-invited"],
  ["delivery-unavailable", "delivery-unavailable"],
  ["error", "invite-error"],
  ["not-found", "invite-error"],
] as const)("[MER-23:web] reports a %s invitation as the %s notice", (kind, notice) => {
  const sending = reduceStaff(ready, { kind: "invite-started" });
  expect(reduceStaff(sending, { kind: "invite-finished", result: { kind } })).toEqual({
    ...ready,
    notice,
  });
});

test.each(["sign-in", "session-changed"] as const)(
  "[MER-23:web] a %s command result replaces the list",
  (kind) => {
    const sending = reduceStaff(ready, { kind: "invite-started" });
    expect(reduceStaff(sending, { kind: "invite-finished", result: { kind } })).toEqual({ kind });
    const revoking = reduceStaff(ready, { kind: "revoke-started", invitationId });
    expect(
      reduceStaff(revoking, { kind: "revoke-finished", invitationId, result: { kind } }),
    ).toEqual({ kind });
  },
);

test("[MER-23:web] removes only the revoked invitation and blocks a second command", () => {
  const revoking = reduceStaff(ready, { kind: "revoke-started", invitationId });
  expect(revoking).toEqual({ ...ready, pending: { invitationId } });
  expect(reduceStaff(revoking, { kind: "invite-started" })).toBe(revoking);

  const revoked = reduceStaff(revoking, {
    kind: "revoke-finished",
    invitationId,
    result: { kind: "revoked" },
  });
  expect(revoked).toEqual({
    kind: "ready",
    list: { ...list, invitations: [list.invitations[1]] },
    notice: "revoked",
  });
});

test("[MER-23:web] a consumed invitation is stale and an uncertain revoke keeps it listed", () => {
  const revoking = reduceStaff(ready, { kind: "revoke-started", invitationId });
  const stale = { kind: "revoke-finished", invitationId, result: { kind: "stale" } } as const;
  expect(reduceStaff(revoking, stale)).toEqual({ ...ready, notice: "stale" });
  const failed = { kind: "revoke-finished", invitationId, result: { kind: "error" } } as const;
  expect(reduceStaff(revoking, failed)).toEqual({ ...ready, notice: "revoke-error" });
});

test("[MER-23:web] reuses a revoke key only for the same invitation and session", () => {
  let keys = 0;
  const createKey = () => `k${String(++keys)}`;
  const first = staffRevokeKey(undefined, { invitationId, sessionId }, createKey);
  expect(first).toEqual({ invitationId, sessionId, key: "k1" });
  expect(staffRevokeKey(first, { invitationId, sessionId }, createKey)).toBe(first);
  expect(staffRevokeKey(first, { invitationId: otherInvitationId, sessionId }, createKey)).toEqual({
    invitationId: otherInvitationId,
    sessionId,
    key: "k2",
  });
});

test("[MER-23:web] a manual reload drops the list and its notice", () => {
  expect(reduceStaff({ ...ready, notice: "stale" }, { kind: "reload" })).toEqual({
    kind: "loading",
  });
  expect(reduceStaff({ kind: "session-changed" }, { kind: "reload" })).toEqual({ kind: "loading" });
  const sending = reduceStaff(ready, { kind: "invite-started" });
  expect(reduceStaff(sending, { kind: "reload" })).toBe(sending);
});
