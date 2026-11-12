import { z } from "./schema.js";

const challengeId = z.uuid();
/** An Algerian mobile number in E.164, the only kind that can receive the OTP SMS. */
export const algerianMobilePhone = z
  .string()
  .length(13)
  .regex(/^\+213[567][0-9]{8}$/);
const otpCode = z
  .string()
  .length(6)
  .regex(/^[0-9]{6}$/);
const transport = z.enum(["web", "bearer"]);
// The last Base64url digit of a 32-byte token has two zero padding bits.
const sessionToken = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const otpPurpose = z.enum(["sign_in", "admin_sign_in", "account_delete"]);
export const requestOtpInput = z.strictObject({
  phone: algerianMobilePhone,
  purpose: otpPurpose.exclude(["account_delete"]),
});
export const requestOtpOutput = z.strictObject({
  challengeId,
  expiresAt: z.iso.datetime(),
  resendAt: z.iso.datetime(),
});

const verifyChallenge = z.strictObject({ challengeId, code: otpCode, transport });
export const verifyOtpInput = verifyChallenge;
export const verifyTotpInput = verifyChallenge;

const webAuthenticated = z.strictObject({
  status: z.literal("authenticated"),
  transport: z.literal("web"),
});
const bearerAuthenticated = z.strictObject({
  status: z.literal("authenticated"),
  transport: z.literal("bearer"),
  token: sessionToken,
});
const totpRequired = z.strictObject({
  status: z.literal("totp_required"),
  challengeId,
  expiresInSeconds: z.literal(300),
});

export const verifyOtpOutput = z.union([webAuthenticated, bearerAuthenticated, totpRequired]);
export const verifyTotpOutput = z.discriminatedUnion("transport", [
  webAuthenticated,
  bearerAuthenticated,
]);

export const sessionBoundCommandHeaders = z.object({
  "idempotency-key": idempotencyKeySchema,
  "x-expected-session-id": z.uuid(),
});

export const logoutInput = z.strictObject({
  scope: z.enum(["current", "all"]),
  expectedSessionId: z.uuid(),
});
export const sessionIdParams = z.strictObject({ sessionId: z.uuid() });

const session = z.strictObject({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  current: z.boolean(),
  deviceName: z.string().min(1).max(120).nullable(),
});

export const sessionListOutput = z.strictObject({ sessions: z.array(session) });
