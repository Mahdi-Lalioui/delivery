import { z } from "zod";
import { algerianMobilePhone, normalizedEmail } from "./auth.js";

const uuid = z.uuid();
// Owners are created by signup (MER-01) only, so an invitation grants manager or staff.
const invitedRole = z.enum(["manager", "staff"]);
const memberRole = z.enum(["owner", "manager", "staff"]);
// The last Base64url digit of a 32-byte token has two zero padding bits.
const invitationToken = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

/** MER-23: an owner invites one verified destination to one restaurant. */
const invitationDetails = { role: invitedRole, locale: z.enum(["ar", "fr", "en"]).optional() };
export const staffInvitationInput = z.union([
  z.strictObject({ phone: algerianMobilePhone, ...invitationDetails }),
  z.strictObject({ email: normalizedEmail, ...invitationDetails }),
]);
const contact = { phoneE164: algerianMobilePhone.optional(), email: normalizedEmail.optional() };

export const staffInvitationOutput = z.strictObject({
  invitationId: uuid,
  merchantId: uuid,
  ...contact,
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
        ...contact,
        role: memberRole,
        isSelf: z.boolean(),
      }),
    )
    .max(50),
  invitations: z
    .array(
      z.strictObject({
        invitationId: uuid,
        ...contact,
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

/** MER-23: the invitee redeems the token once from the account holding the verified contact. */
export const staffInvitationAcceptInput = z.strictObject({ token: invitationToken });

export const staffInvitationAcceptOutput = z.strictObject({
  merchantId: uuid,
  restaurantName: z.string().min(1).max(120),
  role: invitedRole,
});
