import { createHash, createHmac, randomUUIDv7 } from "node:crypto";
import type {
  AuthPurpose,
  AuthRepository,
  AuthTransaction,
  AuthTransport,
  AuthUser,
  DeviceSession,
  ResolvedSession,
  SessionKind,
} from "@zaafran/db/auth";
import {
  createOtpCode,
  createSessionToken,
  hashOtp,
  hashSessionToken,
  matchesOtp,
} from "./auth-crypto.js";
import { matchTotp, openTotpSecret } from "./auth-totp.js";

interface AuthOptions {
  readonly repository: AuthRepository;
  readonly otpKey: Uint8Array;
  readonly totpKey: Uint8Array;
  readonly now: () => Date;
  readonly sendSms: (message: {
    phone: string;
    code: string;
    deliveryKey: string;
  }) => Promise<void> | void;
}

interface OtpRequest {
  readonly phone: string;
  readonly purpose: AuthPurpose;
  readonly requestIp: string;
  readonly idempotencyKey: string;
}

interface Verification {
  readonly challengeId: string;
  readonly idempotencyKey: string;
  readonly code: string;
  readonly transport: AuthTransport;
  readonly requestIp: string;
  readonly deviceName: string | null;
}

type OtpRejection = "invalid" | "expired" | "locked" | "consumed";
type TotpRejection = OtpRejection | "replayed";
type AuthFailureCode =
  | "otp_delivery_unavailable"
  | "idempotency_conflict"
  | "otp_rate_limited"
  | `otp_${OtpRejection}`
  | `totp_${TotpRejection}`;

type Failure = {
  readonly ok: false;
  readonly code: AuthFailureCode;
  readonly retryAfterSeconds?: number;
};
type Result<Value> = { readonly ok: true; readonly value: Value } | Failure;
type Issued = {
  readonly kind: "session";
  readonly transport: AuthTransport;
  readonly token: string;
  readonly now: Date;
  readonly session: DeviceSession;
};
type Pending = { readonly kind: "totp_required"; readonly challengeId: string };
type DeviceScope = { readonly kind: "one"; readonly sessionId: string } | { readonly kind: "all" };

function fail(code: AuthFailureCode): Failure {
  return { ok: false, code };
}

function verificationAttempt(key: Uint8Array, input: Verification) {
  const { challengeId, code, transport, idempotencyKey } = input;
  const requestHash = createHmac("sha256", key)
    .update("auth-verification\0")
    .update(challengeId)
    .update("\0")
    .update(transport)
    .update("\0")
    .update(code)
    .digest();
  return { keyHash: createHash("sha256").update(idempotencyKey).digest(), requestHash };
}

function canSignIn(user: AuthUser | undefined): user is AuthUser {
  return user?.blockedAt === null && user.deletedAt === null;
}

async function issueSession(
  tx: AuthTransaction,
  input: Verification,
  context: { userId: string; kind: SessionKind; now: Date },
): Promise<Result<Issued>> {
  const { token, tokenHash } = createSessionToken();
  const { transport, requestIp, deviceName } = input;
  const session = await tx.insertSession({
    ...context,
    id: randomUUIDv7(),
    tokenHash,
    transport,
    requestIp,
    deviceName,
  });
  return { ok: true, value: { kind: "session", transport, token, now: context.now, session } };
}

async function startAdminVerification(
  tx: AuthTransaction,
  input: Verification,
  context: { phoneE164: string; now: Date },
): Promise<Result<Pending>> {
  const user = await tx.lockUserByPhone(context.phoneE164);
  if (!canSignIn(user)) return fail("otp_invalid");
  const challengeId = randomUUIDv7();
  const created = await tx.insertAdminChallenge({
    id: challengeId,
    userId: user.id,
    otpChallengeId: input.challengeId,
    transport: input.transport,
    now: context.now,
  });
  return created
    ? { ok: true, value: { kind: "totp_required", challengeId } }
    : fail("otp_invalid");
}

async function deliverOtp(
  options: AuthOptions,
  { phone, challengeId, now }: { phone: string; challengeId: string; now: Date },
): Promise<Failure | undefined> {
  try {
    const sent = await options.repository.deliverOtp({
      id: challengeId,
      now,
      send: () =>
        options.sendSms({
          phone,
          code: createOtpCode({ key: options.otpKey, challengeId }),
          deliveryKey: challengeId,
        }),
    });
    return sent ? undefined : fail("otp_expired");
  } catch {
    return fail("otp_delivery_unavailable");
  }
}

export function createAuthService(options: AuthOptions) {
  const { repository } = options;
  return {
    async requestOtp(input: OtpRequest) {
      const now = options.now();
      const id = randomUUIDv7();
      const code = createOtpCode({ key: options.otpKey, challengeId: id });
      const { phone, purpose, requestIp, idempotencyKey } = input;
      const reservation = await repository.transaction((tx) =>
        tx.reserveOtpChallenge({
          id,
          phoneE164: phone,
          purpose,
          requestIp,
          codeHmac: hashOtp({ key: options.otpKey, challengeId: id, code }),
          idempotencyKeyHash: createHash("sha256").update(idempotencyKey).digest(),
          now,
        }),
      );
      if (reservation.kind === "conflict") return fail("idempotency_conflict");
      if (reservation.kind === "rate_limited") {
        return {
          ...fail("otp_rate_limited"),
          retryAfterSeconds: Math.ceil((reservation.retryAt.getTime() - now.getTime()) / 1000),
        };
      }
      const { id: challengeId, expiresAt, resendAt } = reservation.challenge;
      const delivered = await deliverOtp(options, { phone, challengeId, now });
      if (delivered !== undefined) return delivered;
      return {
        ok: true as const,
        value: {
          challengeId,
          expiresAt: expiresAt.toISOString(),
          resendAt: resendAt.toISOString(),
        },
      };
    },

    verifyOtp(input: Verification): Promise<Result<Issued | Pending>> {
      const now = options.now();
      return repository.transaction(async (tx) => {
        const { challengeId, code } = input;
        const digest = hashOtp({ key: options.otpKey, challengeId, code });
        const outcome = await tx.redeemOtp({
          challengeId,
          now,
          attempt: verificationAttempt(options.otpKey, input),
          matchesCode: (storedHmac) => matchesOtp(storedHmac, digest),
        });
        if (outcome.kind === "idempotency_conflict") return fail("idempotency_conflict");
        if (outcome.kind !== "verified") return fail(`otp_${outcome.kind}`);
        const { phoneE164, purpose } = outcome;
        if (purpose === "admin_sign_in")
          return startAdminVerification(tx, input, { phoneE164, now });
        const user = await tx.getOrCreateUserForSignIn({ phoneE164, now });
        if (!canSignIn(user)) return fail("otp_invalid");
        return issueSession(tx, input, { userId: user.id, now, kind: "standard" });
      });
    },

    verifyTotp(input: Verification): Promise<Result<Issued>> {
      const now = options.now();
      return repository.transaction(async (tx) => {
        const { challengeId, code, transport } = input;
        const outcome = await tx.redeemAdminChallenge({
          challengeId,
          transport,
          now,
          attempt: verificationAttempt(options.otpKey, input),
          matchTotp(sealed, userId) {
            const secret = openTotpSecret({ key: options.totpKey, userId, sealed });
            return secret === undefined ? undefined : matchTotp({ secret, code, now });
          },
        });
        if (outcome.kind === "idempotency_conflict") return fail("idempotency_conflict");
        if (outcome.kind !== "verified") return fail(`totp_${outcome.kind}`);
        return issueSession(tx, input, { userId: outcome.userId, now, kind: "admin" });
      });
    },

    async resolveSession({ token, transport }: { token: string; transport: AuthTransport }) {
      const tokenHash = hashSessionToken(token);
      if (tokenHash === undefined) return undefined;
      return repository.resolveSession({ transport, tokenHash, now: options.now() });
    },

    async listSessions(session: ResolvedSession) {
      const devices = await repository.listSessions({ userId: session.userId, now: options.now() });
      return {
        sessions: devices.map(({ id, createdAt, lastSeenAt, expiresAt, deviceName }) => ({
          id,
          deviceName,
          current: session.id === id,
          createdAt: createdAt.toISOString(),
          lastSeenAt: lastSeenAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        })),
      };
    },

    revokeSessions(session: ResolvedSession, scope: DeviceScope) {
      return repository.transaction((tx) =>
        tx.revokeSessions({ userId: session.userId, scope, now: options.now() }),
      );
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
