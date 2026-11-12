import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type OtpDigestInput = {
  readonly key: Uint8Array;
  readonly challengeId: string;
  readonly code: string;
};

const otpRange = 1_000_000;
const uniformOtpLimit = Math.floor(2 ** 48 / otpRange) * otpRange;

export function createOtpCode({ key, challengeId }: Omit<OtpDigestInput, "code">): string {
  // Challenge IDs are random. A separate HMAC domain recovers the same code on delivery retry.
  for (let counter = 0; ; counter += 1) {
    const digest = createHmac("sha256", key)
      .update("otp-code\0")
      .update(challengeId)
      .update("\0")
      .update(counter.toString())
      .digest();
    const value = digest.readUIntBE(0, 6);
    if (value < uniformOtpLimit) return (value % otpRange).toString().padStart(6, "0");
  }
}

export function hashOtp({ key, challengeId, code }: OtpDigestInput): Buffer {
  return createHmac("sha256", key)
    .update("otp\0")
    .update(challengeId)
    .update("\0")
    .update(code)
    .digest();
}

export function matchesOtp(stored: Uint8Array, candidate: Uint8Array): boolean {
  return stored.length === 32 && candidate.length === 32 && timingSafeEqual(stored, candidate);
}

function hashSessionBytes(bytes: Uint8Array): Buffer {
  return createHash("sha256").update(bytes).digest();
}

export function createSessionToken(): { token: string; tokenHash: Buffer } {
  const bytes = randomBytes(32);
  return { token: bytes.toString("base64url"), tokenHash: hashSessionBytes(bytes) };
}

export function hashSessionToken(token: string): Buffer | undefined {
  if (token.length !== 43) return undefined;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== token) return undefined;
  return hashSessionBytes(bytes);
}

export function createStaffInvitationToken({
  key,
  merchantId,
  accountId,
  idempotencyKey,
}: {
  key: Uint8Array;
  merchantId: string;
  accountId: string;
  idempotencyKey: string;
}): string {
  return createHmac("sha256", key)
    .update("staff-invitation\0")
    .update(JSON.stringify([merchantId, accountId, idempotencyKey]))
    .digest("base64url");
}
