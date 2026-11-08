import type { TransactionSql } from "postgres";
import {
  readVerificationReceipt,
  writeVerificationReceipt,
  type VerificationAttempt,
  type VerificationReceipt,
} from "./auth-receipts.js";
import { timestampParsers } from "./timestamp-parsers.js";
import type { AuthPurpose } from "./auth-types.js";

const minuteMs = 60_000;
const resendMs = 45_000;
const otpLifetimeMs = 5 * minuteMs;
const attemptLimit = 5;

interface OtpReservation {
  readonly id: string;
  readonly phoneE164: string;
  readonly requestIp: string;
  readonly purpose: AuthPurpose;
  readonly codeHmac: Uint8Array;
  readonly idempotencyKeyHash: Uint8Array;
  readonly now: Date;
}

interface OtpChallengeSummary {
  readonly id: string;
  readonly expiresAt: Date;
  readonly resendAt: Date;
}

type ReservationResult =
  | { readonly kind: "created" | "replayed"; readonly challenge: OtpChallengeSummary }
  | { readonly kind: "conflict" }
  | { readonly kind: "rate_limited"; readonly retryAt: Date };

interface OtpReceipt {
  readonly id: string;
  readonly purpose: AuthPurpose;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
}

interface OtpVerification {
  readonly challengeId: string;
  readonly now: Date;
  readonly matchesCode: (storedHmac: Uint8Array) => boolean;
  readonly attempt?: VerificationAttempt;
}

interface StoredOtp {
  readonly phoneE164: string;
  readonly purpose: AuthPurpose;
  readonly codeHmac: Uint8Array;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attempts: number;
}

type OtpAttemptResult =
  | { readonly kind: "verified"; readonly phoneE164: string; readonly purpose: AuthPurpose }
  | { readonly kind: "invalid" | "locked" };

type OtpChallengeResult =
  OtpAttemptResult | { readonly kind: "expired" | "consumed" | "idempotency_conflict" };

function replayOtp(receipt: OtpReceipt, purpose: AuthPurpose): ReservationResult {
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

async function lockOtpIp(sql: TransactionSql, requestIp: string): Promise<string> {
  const [address] = await sql<{ ip: string }[]>`
    SELECT host(
      CASE WHEN ${requestIp}::inet <<= '::ffff:0:0/96'::inet
        THEN '0.0.0.0'::inet + (${requestIp}::inet - '::ffff:0:0'::inet)
        ELSE ${requestIp}::inet
      END
    ) AS ip
  `;
  if (!address) throw new Error("Could not resolve the OTP source address.");
  await sql`SELECT pg_advisory_xact_lock(63841, hashtext(${address.ip}))`;
  return address.ip;
}

async function findRetryAt(
  sql: TransactionSql,
  input: Pick<OtpReservation, "phoneE164" | "requestIp" | "now">,
): Promise<Date | undefined> {
  const { now, phoneE164, requestIp } = input;
  const [limits] = await sql<{ retryAt: Date | null }[]>`
    WITH phone_requests AS (
      SELECT requested_at FROM public.otp_challenges
      WHERE phone_e164 = ${phoneE164} AND requested_at > ${now.toISOString()}::timestamptz - interval '24 hours'
      ORDER BY requested_at DESC LIMIT 10
    ),
    ip_requests AS (
      SELECT requested_at FROM public.otp_challenges
      WHERE request_ip = ${requestIp}::inet AND requested_at > ${now.toISOString()}::timestamptz - interval '1 hour'
      ORDER BY requested_at DESC LIMIT 20
    )
    SELECT greatest(
      (SELECT requested_at + interval '45 seconds' FROM phone_requests ORDER BY requested_at DESC LIMIT 1),
      (SELECT requested_at + interval '15 minutes' FROM phone_requests ORDER BY requested_at DESC OFFSET 2 LIMIT 1),
      (SELECT requested_at + interval '24 hours' FROM phone_requests ORDER BY requested_at DESC OFFSET 9 LIMIT 1),
      (SELECT requested_at + interval '1 hour' FROM ip_requests ORDER BY requested_at DESC OFFSET 19 LIMIT 1)
    ) AS "retryAt"
  `.parsers(timestampParsers);
  const retryAt = limits?.retryAt;
  return retryAt && retryAt > now ? retryAt : undefined;
}

export async function reserveOtpChallenge(
  sql: TransactionSql,
  input: OtpReservation,
): Promise<ReservationResult> {
  const { id, phoneE164, requestIp, purpose, codeHmac, idempotencyKeyHash, now } = input;
  // Every reservation acquires the phone namespace before the IP namespace.
  await sql`SELECT pg_advisory_xact_lock(63840, hashtext(${phoneE164}))`;
  const [receipt] = await sql<OtpReceipt[]>`
    SELECT id, purpose, requested_at AS "requestedAt", expires_at AS "expiresAt"
    FROM public.otp_challenges
    WHERE phone_e164 = ${phoneE164} AND idempotency_key_hash = ${idempotencyKeyHash}
  `.parsers(timestampParsers);
  if (receipt) return replayOtp(receipt, purpose);

  const ip = await lockOtpIp(sql, requestIp);
  const retryAt = await findRetryAt(sql, { phoneE164, requestIp: ip, now });
  if (retryAt) return { kind: "rate_limited", retryAt };

  const expiresAt = new Date(now.getTime() + otpLifetimeMs);
  await sql`
    INSERT INTO public.otp_challenges
      (id, phone_e164, request_ip, purpose, code_hmac, idempotency_key_hash, requested_at, expires_at)
    VALUES (${id}, ${phoneE164}, ${ip}::inet, ${purpose}, ${codeHmac}, ${idempotencyKeyHash}, ${now.toISOString()}, ${expiresAt.toISOString()})
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
  return { kind: "verified", phoneE164: challenge.phoneE164, purpose: challenge.purpose };
}

export async function redeemOtp(
  sql: TransactionSql,
  input: OtpVerification,
): Promise<OtpChallengeResult> {
  const { challengeId, attempt, now } = input;
  const [challenge] = await sql<StoredOtp[]>`
    SELECT phone_e164 AS "phoneE164", purpose, code_hmac AS "codeHmac",
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
