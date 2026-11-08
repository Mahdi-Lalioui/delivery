import { expect, test } from "vitest";
import {
  staffInvitationAcceptInput,
  staffInvitationAcceptOutput,
  staffInvitationInput,
  staffInvitationOutput,
  staffInvitationParams,
  staffListOutput,
  staffRevokeOutput,
} from "../src/merchant-staff.ts";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const invitationId = "01932f18-3150-7c33-8a7a-53acfd343301";
const userId = "01932f18-3150-7c33-8a7a-53acfd343401";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343201";
const expiresAt = "2026-11-15T12:00:00.000Z";
const createdAt = "2026-11-08T12:00:00.000Z";
const token = "A".repeat(42) + "E";

test("[MER-23:contract] an owner invites a manager or staff by Algerian mobile number only", () => {
  expect(staffInvitationInput.parse({ phone: "+213550000301", role: "manager" })).toEqual({
    phone: "+213550000301",
    role: "manager",
  });
  expect(staffInvitationInput.parse({ phone: "+213770000301", role: "staff" }).role).toBe("staff");
  for (const invalid of [
    { phone: "+213550000301", role: "owner" },
    { phone: "+213450000301", role: "staff" },
    { phone: "0550000301", role: "staff" },
    { phone: "+213550000301" },
    { phone: "+213550000301", role: "staff", merchantId },
  ]) {
    expect(staffInvitationInput.safeParse(invalid).success).toBe(false);
  }
});

test("[MER-23:contract] the invitation result never carries the secret token", () => {
  const result = {
    invitationId,
    merchantId,
    phoneE164: "+213550000301",
    role: "staff",
    status: "pending",
    expiresAt,
  };
  expect(staffInvitationOutput.parse(result)).toEqual(result);
  expect(staffInvitationOutput.safeParse({ ...result, token }).success).toBe(false);
  expect(staffInvitationOutput.safeParse({ ...result, role: "owner" }).success).toBe(false);
});

test("[MER-23:contract] the staff list is bounded and separates members from open invitations", () => {
  const list = {
    sessionId,
    merchantId,
    members: [{ userId, phoneE164: "+213550000302", role: "owner", isSelf: true }],
    invitations: [
      { invitationId, phoneE164: "+213550000301", role: "manager", createdAt, expiresAt },
    ],
  };
  expect(staffListOutput.parse(list)).toEqual(list);
  const tooMany = Array.from({ length: 51 }, () => list.members[0]);
  expect(staffListOutput.safeParse({ ...list, members: tooMany }).success).toBe(false);
  const ownerInvite = [{ ...list.invitations[0], role: "owner" }];
  expect(staffListOutput.safeParse({ ...list, invitations: ownerInvite }).success).toBe(false);
});

test("[MER-23:contract] accepting needs exactly one well-formed 32-byte token", () => {
  expect(staffInvitationAcceptInput.parse({ token })).toEqual({ token });
  for (const invalid of [
    { token: "A".repeat(42) + "B" },
    { token: "A".repeat(42) },
    { token: "A".repeat(42) + "+" },
    { token, phone: "+213550000301" },
    {},
  ]) {
    expect(staffInvitationAcceptInput.safeParse(invalid).success).toBe(false);
  }
});

test("[MER-23:contract] acceptance, revocation and route params echo only their ids", () => {
  const accepted = { merchantId, restaurantName: "Table fictive", role: "manager" };
  expect(staffInvitationAcceptOutput.parse(accepted)).toEqual(accepted);
  expect(staffInvitationAcceptOutput.safeParse({ ...accepted, role: "owner" }).success).toBe(false);
  expect(staffRevokeOutput.parse({ invitationId, status: "revoked" }).status).toBe("revoked");
  expect(staffInvitationParams.parse({ merchantId, invitationId })).toEqual({
    merchantId,
    invitationId,
  });
  expect(staffInvitationParams.safeParse({ merchantId, invitationId: "x" }).success).toBe(false);
});
