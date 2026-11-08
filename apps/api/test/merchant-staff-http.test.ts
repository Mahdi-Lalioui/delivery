import { createHash } from "node:crypto";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { staffInvitationOutput, staffListOutput } from "@zaafran/contracts/merchant-staff";
import type { createMerchantStaffRepository } from "@zaafran/db/merchant-staff";
import type { LightMyRequestResponse } from "fastify";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { MerchantStaffServices } from "../src/merchant-staff-routes.ts";

type StaffRepository = ReturnType<typeof createMerchantStaffRepository>;

const now = new Date("2026-11-08T12:00:00.000Z");
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const invitationId = "01932f18-3150-7c33-8a7a-53acfd343301";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343004";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343007";
const token = "A".repeat(42) + "E";
const owner = { role: "customer", accountId, sessionId } as const;
const headers = { "idempotency-key": "fixture-invite", "x-expected-session-id": sessionId };
const base = `/v1/merchants/${merchantId}/staff`;
const invitation = {
  invitationId,
  merchantId,
  phoneE164: "+213550000301",
  role: "staff",
  status: "pending",
  expiresAt: "2026-11-15T12:00:00.000Z",
} as const;
const inviteRequest = {
  method: "POST",
  url: `${base}/invitations`,
  headers,
  payload: { phone: "+213550000301", role: "staff" },
} as const;

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function expectProblem(response: LightMyRequestResponse, status: number, code: string) {
  expect(response.statusCode).toBe(status);
  expect(problemResponseSchema.parse(response.json())).toMatchObject({ status, code });
}

function setup() {
  const repository = {
    create: vi.fn<StaffRepository["create"]>(),
    list: vi.fn<StaffRepository["list"]>(),
    revoke: vi.fn<StaffRepository["revoke"]>(),
    accept: vi.fn<StaffRepository["accept"]>(),
  } satisfies StaffRepository;
  const sendInvitation = vi.fn<MerchantStaffServices["sendInvitation"]>();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: vi.fn(() => Promise.resolve(owner)),
    merchantStaff: { repository, now: () => now, createToken: () => token, sendInvitation },
  });
  onTestFinished(() => api.close());
  return { api, repository, sendInvitation };
}

test("[MER-23:http] an owner invitation stores only the token hash and texts the token once", async () => {
  const { api, repository, sendInvitation } = setup();
  repository.create.mockResolvedValue({ kind: "applied", invitation });

  const response = await api.inject(inviteRequest);

  expect(response.statusCode).toBe(201);
  expect(staffInvitationOutput.parse(response.json())).toEqual(invitation);
  expect(response.body).not.toContain(token);
  const call = repository.create.mock.calls[0]?.[0];
  expect(call).toMatchObject({ accountId, merchantId, phone: "+213550000301", role: "staff", now });
  expect(call?.tokenHash).toEqual(sha256(token));
  expect(sendInvitation).toHaveBeenCalledExactlyOnceWith({
    phone: "+213550000301",
    token,
    deliveryKey: invitationId,
  });
});

test("[MER-23:http] an open replay resends a fresh token; a closed one sends nothing", async () => {
  const { api, repository, sendInvitation } = setup();
  repository.create.mockResolvedValueOnce({ kind: "replayed", invitation, isOpen: true });
  expect((await api.inject(inviteRequest)).statusCode).toBe(201);
  expect(repository.create.mock.calls[0]?.[0].tokenHash).toEqual(sha256(token));
  expect(sendInvitation).toHaveBeenCalledExactlyOnceWith({
    phone: "+213550000301",
    token,
    deliveryKey: invitationId,
  });

  repository.create.mockResolvedValueOnce({ kind: "replayed", invitation, isOpen: false });
  expect((await api.inject(inviteRequest)).statusCode).toBe(201);
  expect(sendInvitation).toHaveBeenCalledOnce();
});

test.each([
  ["not_found", 404],
  ["already_member", 409],
  ["already_invited", 409],
  ["idempotency_conflict", 409],
] as const)("[MER-23:http] maps an invitation %s to %i", async (kind, status) => {
  const { api, repository, sendInvitation } = setup();
  repository.create.mockResolvedValue({ kind });
  expectProblem(await api.inject(inviteRequest), status, kind);
  expect(sendInvitation).not.toHaveBeenCalled();
});

test("[MER-23:http] a failed SMS is reported so the owner can revoke and invite again", async () => {
  const { api, repository, sendInvitation } = setup();
  repository.create.mockResolvedValue({ kind: "applied", invitation });
  sendInvitation.mockRejectedValue(new Error("SMS down"));
  expectProblem(await api.inject(inviteRequest), 503, "invitation_delivery_unavailable");
});

test("[MER-23:http] a changed session is refused before any write", async () => {
  const { api, repository } = setup();
  const response = await api.inject({
    ...inviteRequest,
    headers: { ...headers, "x-expected-session-id": invitationId },
  });
  expectProblem(response, 409, "session_changed");
  expect(repository.create).not.toHaveBeenCalled();
});

test("[MER-23:http] the owner staff list is private and maps a non-owner to 404", async () => {
  const { api, repository } = setup();
  const members = [
    { userId: accountId, phoneE164: "+213550000302", role: "owner", isSelf: true } as const,
  ];
  repository.list.mockResolvedValueOnce({ members, invitations: [] });

  const response = await api.inject(base);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(staffListOutput.parse(response.json())).toEqual({
    sessionId,
    merchantId,
    members,
    invitations: [],
  });
  expect(repository.list).toHaveBeenCalledWith({ accountId, merchantId, now });

  repository.list.mockResolvedValueOnce(undefined);
  expectProblem(await api.inject(base), 404, "not_found");
});

test("[MER-23:http] revoking returns the revoked status or maps the failure", async () => {
  const { api, repository } = setup();
  const request = {
    method: "POST",
    url: `${base}/invitations/${invitationId}/revoke`,
    headers,
  } as const;
  repository.revoke.mockResolvedValueOnce({ kind: "revoked" });
  const response = await api.inject(request);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ invitationId, status: "revoked" });
  expect(repository.revoke).toHaveBeenCalledWith({ accountId, merchantId, invitationId, now });

  repository.revoke.mockResolvedValueOnce({ kind: "already_consumed" });
  expectProblem(await api.inject(request), 409, "already_consumed");
  repository.revoke.mockResolvedValueOnce({ kind: "not_found" });
  expectProblem(await api.inject(request), 404, "not_found");
});

test("[MER-23:http] accepting hashes the token and joins with the invited role", async () => {
  const { api, repository } = setup();
  const request = {
    method: "POST",
    url: "/v1/staff-invitations/accept",
    payload: { token },
  } as const;
  const accepted = { merchantId, restaurantName: "Table fictive", role: "manager" } as const;
  repository.accept.mockResolvedValueOnce({ kind: "accepted", ...accepted });

  const response = await api.inject(request);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(accepted);
  expect(repository.accept).toHaveBeenCalledWith({ accountId, tokenHash: sha256(token), now });

  repository.accept.mockResolvedValueOnce({ kind: "not_found" });
  expectProblem(await api.inject(request), 404, "not_found");
  repository.accept.mockResolvedValueOnce({ kind: "already_member" });
  expectProblem(await api.inject(request), 409, "already_member");
});
