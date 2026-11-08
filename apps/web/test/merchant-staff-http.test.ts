import { afterEach, expect, test, vi } from "vitest";
import {
  acceptStaffInvitation,
  listStaff,
  prepareStaffInvitation,
  revokeStaffInvitation,
  sendStaffInvitation,
} from "../src/merchant-staff/staff-http";

const merchantId = "019d6abc-1234-7234-8234-123456789def";
const invitationId = "019d6abc-1234-7234-8234-123456789abc";
const sessionId = "019d6abc-1234-7234-8234-123456789aaa";
const token = "A".repeat(42) + "E";
const base = `/v1/merchants/${merchantId}/staff`;
const invitation = {
  invitationId,
  merchantId,
  phoneE164: "+213550000301",
  role: "staff",
  status: "pending",
  expiresAt: "2026-11-15T12:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

function respondWith(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function problem(status: number, code: string) {
  const body = { type: "about:blank", title: "Problem", status, code, requestId: "request-1" };
  return Response.json(body, { status, headers: { "content-type": "application/problem+json" } });
}

test("[MER-23:web] reads the owner staff list with the same-origin session only", async () => {
  const list = { sessionId, merchantId, members: [], invitations: [] };
  const fetch = respondWith(Response.json(list));
  await expect(listStaff({ merchantId })).resolves.toEqual({ kind: "ready", list });
  expect(fetch).toHaveBeenCalledWith(base, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });

  respondWith(problem(404, "not_found"));
  await expect(listStaff({ merchantId })).resolves.toEqual({ kind: "not-found" });
  respondWith(problem(401, "unauthorized"));
  await expect(listStaff({ merchantId })).resolves.toEqual({ kind: "sign-in" });
  respondWith(Response.json({ ...list, members: "x" }));
  await expect(listStaff({ merchantId })).resolves.toEqual({ kind: "error" });
});

test("[MER-23:web] normalizes a local phone and reuses the key only for the same invitation", () => {
  const first = prepareStaffInvitation({
    merchantId,
    expectedSessionId: sessionId,
    phone: "0550 00 03 01",
    role: "staff",
  });
  expect(first).toMatchObject({ kind: "ready", attempt: { input: { phone: "+213550000301" } } });
  if (first.kind !== "ready") throw new Error("Expected a valid invitation.");
  const retry = prepareStaffInvitation({
    merchantId,
    expectedSessionId: sessionId,
    phone: "+213550000301",
    role: "staff",
    previous: first.attempt,
  });
  expect(retry).toEqual(first);
  const changed = prepareStaffInvitation({
    merchantId,
    expectedSessionId: sessionId,
    phone: "0550000301",
    role: "manager",
    previous: first.attempt,
  });
  expect(changed.kind === "ready" && changed.attempt.key).not.toBe(first.attempt.key);

  const scope = { merchantId, expectedSessionId: sessionId };
  expect(prepareStaffInvitation({ ...scope, phone: "021 00 00 00", role: "staff" })).toEqual({
    kind: "invalid",
    field: "phone",
  });
  expect(prepareStaffInvitation({ ...scope, phone: "0550000301", role: "" })).toEqual({
    kind: "invalid",
    field: "role",
  });
});

test("[MER-23:web] sends a session-bound invitation and classifies every refusal", async () => {
  const prepared = prepareStaffInvitation({
    merchantId,
    expectedSessionId: sessionId,
    phone: "0550000301",
    role: "staff",
  });
  if (prepared.kind !== "ready") throw new Error("Expected a valid invitation.");
  const fetch = respondWith(Response.json(invitation, { status: 201 }));
  await expect(sendStaffInvitation(prepared.attempt)).resolves.toEqual({
    kind: "invited",
    invitation,
  });
  expect(fetch).toHaveBeenCalledWith(`${base}/invitations`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": prepared.attempt.key,
      "X-Expected-Session-Id": sessionId,
    },
    body: JSON.stringify({ phone: "+213550000301", role: "staff" }),
  });

  for (const [status, code, kind] of [
    [409, "already_member", "already-member"],
    [409, "already_invited", "already-invited"],
    [409, "session_changed", "session-changed"],
    [503, "invitation_delivery_unavailable", "delivery-unavailable"],
    [404, "not_found", "not-found"],
    [403, "forbidden", "sign-in"],
    [500, "internal_error", "error"],
  ] as const) {
    respondWith(problem(status, code));
    await expect(sendStaffInvitation(prepared.attempt)).resolves.toEqual({ kind });
  }
});

test("[MER-23:web] revokes an open invitation and treats a used one as stale", async () => {
  const request = { merchantId, invitationId, expectedSessionId: sessionId, key: "key-1" };
  const fetch = respondWith(Response.json({ invitationId, status: "revoked" }));
  await expect(revokeStaffInvitation(request)).resolves.toEqual({ kind: "revoked" });
  expect(fetch).toHaveBeenCalledWith(`${base}/invitations/${invitationId}/revoke`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "Idempotency-Key": "key-1", "X-Expected-Session-Id": sessionId },
  });

  respondWith(problem(409, "already_consumed"));
  await expect(revokeStaffInvitation(request)).resolves.toEqual({ kind: "stale" });
  respondWith(Response.json({ invitationId: merchantId, status: "revoked" }));
  await expect(revokeStaffInvitation(request)).resolves.toEqual({ kind: "error" });
});

test("[MER-23:web] accepts a well-formed token and maps the refusals", async () => {
  const accepted = { merchantId, restaurantName: "Table fictive", role: "manager" };
  const fetch = respondWith(Response.json(accepted));
  await expect(acceptStaffInvitation(token)).resolves.toEqual({ kind: "accepted", accepted });
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    method: "POST",
    body: JSON.stringify({ token }),
  });

  respondWith(problem(404, "not_found"));
  await expect(acceptStaffInvitation(token)).resolves.toEqual({ kind: "not-found" });
  respondWith(problem(409, "already_member"));
  await expect(acceptStaffInvitation(token)).resolves.toEqual({ kind: "already-member" });
  respondWith(problem(401, "unauthorized"));
  await expect(acceptStaffInvitation(token)).resolves.toEqual({ kind: "sign-in" });

  const untouched = respondWith(Response.json(accepted));
  await expect(acceptStaffInvitation("not-a-token")).resolves.toEqual({ kind: "not-found" });
  expect(untouched).not.toHaveBeenCalled();
});
