import type { TransactionSql } from "postgres";
import { lockOtpIdentifier, normalizeOtpIp } from "./auth-otp-lock.js";
import {
  readVerificationReceipt,
  writeVerificationReceipt,
  type VerificationAttempt,
  type VerificationReceipt,
} from "./auth-receipts.js";
import { timestampParsers } from "./timestamp-parsers.js";
import type { AuthIdentifier, AuthPurpose } from "./auth-types.js";

const minuteMs = 60_000;
const resendMs = 45_000;
const otpLifetimeMs = 10 * minuteMs;
const attemptLimit = 5;

export interface OtpBinding {
  readonly userId: string;
  readonly sessionId: string;
}

export type OtpReservation = AuthIdentifier & {
  readonly id: string;
  readonly requestIp: string;
  readonly purpose: OtpPurpose;
  readonly codeHmac: Uint8Array;
  readonly idempotencyKeyHash: Uint8Array;
  readonly now: Date;
};

interface OtpChallengeSummary {
  readonly id: string;
  readonly expiresAt: Date;
  readonly resendAt: Date;
}

type OtpPurpose = AuthPurpose | "identifier_change";

export type ReservationResult =
  | { readonly kind: "created" | "replayed"; readonly challenge: OtpChallengeSummary }
  | { readonly kind: "conflict" }
  | { readonly kind: "rate_limited"; readonly retryAt: Date };

interface OtpReceipt {
  readonly id: string;
  readonly purpose: OtpPurpose;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
}

export interface OtpVerification {
  readonly challengeId: string;
  readonly now: Date;
  readonly matchesCode: (storedHmac: Uint8Array) => boolean;
  readonly attempt?: VerificationAttempt;
}

type StoredIdentifier = { phoneE164: string | null; email: string | null };

interface StoredOtp extends StoredIdentifier {
  readonly purpose: OtpPurpose;
  readonly codeHmac: Uint8Array;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attempts: number;
}

type OtpAttemptResult =
  | (AuthIdentifier & { readonly kind: "verified"; readonly purpose: OtpPurpose })
  | { readonly kind: "invalid" | "locked" };

type OtpChallengeResult =
  OtpAttemptResult | { readonly kind: "expired" | "consumed" | "idempotency_conflict" };

function replayOtp(receipt: OtpReceipt, purpose: OtpPurpose): ReservationResult {
  if (receipt.purpose !== purpose) return { kind: "conflict" };
  return {
    kind: "replayed",
    challenge: {
      id: receipt.id,
      expiresAt: receipt.expiresAt,
      resendAt: new Date(receipt.requestedAt.getTime() + resendMs),
    },
  };
}

function readIdentifier({ email, phoneE164 }: StoredIdentifier): AuthIdentifier {
  if (email !== null) return { email };
  if (phoneE164 === null) throw new Error("Missing OTP identifier.");
  return { phoneE164 };
}

function identifierScope(sql: TransactionSql, identity: AuthIdentifier) {
  return identity.email !== undefined
    ? sql`email = ${identity.email}`
    : sql`phone_e164 = ${identity.phoneE164}`;
}

function bindingScope(sql: TransactionSql, binding: OtpBinding | undefined) {
  return sql`binding_user_id IS NOT DISTINCT FROM ${binding?.userId ?? null}::uuid
    AND binding_session_id IS NOT DISTINCT FROM ${binding?.sessionId ?? null}::uuid`;
}

async function findRetryAt(
  sql: TransactionSql,
  input: AuthIdentifier & Pick<OtpReservation, "requestIp" | "now">,
): Promise<Date | undefined> {
  const { now, requestIp } = input;
  const identifier = input.email ?? input.phoneE164;
  const channel = input.email === undefined ? "phone" : "email";
  const [limits] = await sql<{ retryAt: Date | null }[]>`
    WITH identifier_requests AS (
      SELECT requested_at FROM (
        SELECT requested_at FROM public.otp_challenges
        WHERE ${identifierScope(sql, input)}
        UNION ALL
        SELECT requested_at FROM public.auth_otp_rate_history
        WHERE phone_hash = public.auth_otp_rate_digest(${channel}, ${identifier})
      ) AS history
      WHERE requested_at > ${now.toISOString()}::timestamptz - interval '24 hours'
      ORDER BY requested_at DESC LIMIT 10
    ),
    ip_requests AS (
      SELECT requested_at FROM (
        SELECT requested_at FROM public.otp_challenges
        WHERE request_ip = ${requestIp}::inet
        UNION ALL
        SELECT requested_at FROM public.auth_otp_rate_history
        WHERE ip_hash = public.auth_otp_rate_digest('ip', ${requestIp})
      ) AS history
      WHERE requested_at > ${now.toISOString()}::timestamptz - interval '1 hour'
      ORDER BY requested_at DESC LIMIT 20
    )
    SELECT greatest(
      (SELECT requested_at + interval '45 seconds' FROM identifier_requests ORDER BY requested_at DESC LIMIT 1),
      (SELECT requested_at + interval '15 minutes' FROM identifier_requests ORDER BY requested_at DESC OFFSET 2 LIMIT 1),
      (SELECT requested_at + interval '24 hours' FROM identifier_requests ORDER BY requested_at DESC OFFSET 9 LIMIT 1),
      (SELECT requested_at + interval '1 hour' FROM ip_requests ORDER BY requested_at DESC OFFSET 19 LIMIT 1)
    ) AS "retryAt"
  `.parsers(timestampParsers);
  const retryAt = limits?.retryAt;
  return retryAt && retryAt > now ? retryAt : undefined;
}

export async function reserveOtpChallenge(
  sql: TransactionSql,
  input: OtpReservation,
  binding?: OtpBinding,
): Promise<ReservationResult> {
  const {
    id,
    phoneE164 = null,
    email = null,
    requestIp,
    purpose,
    codeHmac,
    idempotencyKeyHash,
    now,
  } = input;
  const { userId = null, sessionId = null } = binding ?? {};
  // Acquire the identifier namespace before the IP namespace.
  await lockOtpIdentifier(sql, input.email ?? input.phoneE164);
  const [receipt] = await sql<OtpReceipt[]>`
    SELECT id, purpose, requested_at AS "requestedAt", expires_at AS "expiresAt"
    FROM public.otp_challenges
    WHERE ${identifierScope(sql, input)} AND idempotency_key_hash = ${idempotencyKeyHash}
      AND ${bindingScope(sql, binding)}
  `.parsers(timestampParsers);
  if (receipt) return replayOtp(receipt, purpose);

  const ip = await normalizeOtpIp(sql, requestIp);
  await sql`SELECT pg_advisory_xact_lock(63841, hashtext(${ip}))`;
  const retryAt = await findRetryAt(sql, { ...input, requestIp: ip });
  if (retryAt) return { kind: "rate_limited", retryAt };

  const expiresAt = new Date(now.getTime() + otpLifetimeMs);
  await sql`
    INSERT INTO public.otp_challenges
      (id, phone_e164, email, request_ip, purpose, code_hmac, idempotency_key_hash, requested_at, expires_at, binding_user_id, binding_session_id)
    VALUES (${id}, ${phoneE164}, ${email}, ${ip}::inet, ${purpose}, ${codeHmac}, ${idempotencyKeyHash}, ${now.toISOString()}, ${expiresAt.toISOString()}, ${userId}, ${sessionId})
  `;
  return {
    kind: "created",
    challenge: { id, expiresAt, resendAt: new Date(now.getTime() + resendMs) },
  };
}

export interface OtpDelivery {
  readonly id: string;
  readonly now: Date;
  readonly send: () => Promise<void> | void;
}

export async function deliverOtp(
  sql: TransactionSql,
  { id, now, send }: OtpDelivery,
): Promise<boolean> {
  const timestamp = now.toISOString();
  const [challenge] = await sql<{ delivered: boolean; active: boolean }[]>`
    SELECT sms_delivered_at IS NOT NULL AS delivered,
      expires_at > ${timestamp}::timestamptz AS active
    FROM public.otp_challenges
    WHERE id = ${id}
    FOR UPDATE
  `;
  if (!challenge) return false;
  if (challenge.delivered) return true;
  if (!challenge.active) return false;

  await send();
  await sql`UPDATE public.otp_challenges SET sms_delivered_at = ${timestamp} WHERE id = ${id}`;
  return true;
}

async function verifyLockedOtp(
  sql: TransactionSql,
  { challengeId, now, matchesCode }: OtpVerification,
  challenge: StoredOtp,
): Promise<OtpAttemptResult> {
  if (!matchesCode(challenge.codeHmac)) {
    await sql`UPDATE public.otp_challenges SET attempts = attempts + 1 WHERE id = ${challengeId}`;
    return { kind: challenge.attempts + 1 === attemptLimit ? "locked" : "invalid" };
  }

  await sql`UPDATE public.otp_challenges SET consumed_at = ${now.toISOString()} WHERE id = ${challengeId}`;
  return { kind: "verified", ...readIdentifier(challenge), purpose: challenge.purpose };
}

export async function redeemOtp(
  sql: TransactionSql,
  input: OtpVerification,
  binding?: OtpBinding,
): Promise<OtpChallengeResult> {
  const { challengeId, attempt, now } = input;
  // Account changes and deletion share the identifier lock with verification.
  const [unlocked] = await sql<StoredIdentifier[]>`
    SELECT phone_e164 AS "phoneE164", email FROM public.otp_challenges WHERE id = ${challengeId}
      AND ${bindingScope(sql, binding)}
  `;
  if (!unlocked) return { kind: "invalid" };
  const identity = readIdentifier(unlocked);
  await lockOtpIdentifier(sql, identity.email ?? identity.phoneE164);

  const [challenge] = await sql<StoredOtp[]>`
    SELECT phone_e164 AS "phoneE164", email, purpose, code_hmac AS "codeHmac",
      requested_at AS "requestedAt", expires_at AS "expiresAt", consumed_at AS "consumedAt", attempts
    FROM public.otp_challenges WHERE id = ${challengeId}
    FOR UPDATE
  `.parsers(timestampParsers);
  if (!challenge) return { kind: "invalid" };

  const receipt: VerificationReceipt = { factor: "otp", challengeId, attempt };
  const replay = await readVerificationReceipt(sql, receipt);
  if (replay) return replay;

  if (now < challenge.requestedAt) return { kind: "invalid" };
  if (challenge.consumedAt) return { kind: "consumed" };
  if (challenge.attempts >= attemptLimit) return { kind: "locked" };
  if (now >= challenge.expiresAt) return { kind: "expired" };

  const result = await verifyLockedOtp(sql, input, challenge);
  await writeVerificationReceipt(sql, receipt, result.kind);
  return result;
}
