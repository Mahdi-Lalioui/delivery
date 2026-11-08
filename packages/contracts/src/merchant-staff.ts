import { z } from "zod";
import { algerianMobilePhone } from "./auth.js";

const uuid = z.uuid();
// Owners are created by signup (MER-01) only, so an invitation grants manager or staff.
const invitedRole = z.enum(["manager", "staff"]);
const memberRole = z.enum(["owner", "manager", "staff"]);
// The last Base64url digit of a 32-byte token has two zero padding bits.
const invitationToken = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

/** MER-23: an owner invites a phone number to a role at one restaurant. */
export const staffInvitationInput = z.strictObject({
  phone: algerianMobilePhone,
  role: invitedRole,
});

// The token travels only in the SMS link, never back to the inviter.
export const staffInvitationOutput = z.strictObject({
  invitationId: uuid,
  merchantId: uuid,
  phoneE164: algerianMobilePhone,
  role: invitedRole,
  status: z.literal("pending"),
  expiresAt: z.iso.datetime(),
});

export const staffInvitationParams = z.strictObject({
  merchantId: uuid,
  invitationId: uuid,
});

export const staffListOutput = z.strictObject({
  sessionId: uuid,
  merchantId: uuid,
  members: z
    .array(
      z.strictObject({
        userId: uuid,
        phoneE164: algerianMobilePhone,
        role: memberRole,
        isSelf: z.boolean(),
      }),
    )
    .max(50),
  invitations: z
    .array(
      z.strictObject({
        invitationId: uuid,
        phoneE164: algerianMobilePhone,
        role: invitedRole,
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
      }),
    )
    .max(50),
});

export const staffRevokeOutput = z.strictObject({
  invitationId: uuid,
  status: z.literal("revoked"),
});

/** MER-23: the invitee, signed in with the invited phone, redeems the SMS token once. */
export const staffInvitationAcceptInput = z.strictObject({ token: invitationToken });

export const staffInvitationAcceptOutput = z.strictObject({
  merchantId: uuid,
  restaurantName: z.string().min(1).max(120),
  role: invitedRole,
});
