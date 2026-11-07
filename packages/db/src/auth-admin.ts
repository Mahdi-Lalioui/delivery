import type { TransactionSql } from "postgres";
import {
  readVerificationReceipt,
  writeVerificationReceipt,
  type VerificationAttempt,
  type VerificationReceipt,
} from "./auth-receipts.js";
import { authTimestampParsers } from "./auth-sql.js";
import type { AuthTransport } from "./auth-types.js";

const challengeLifetimeMs = 300_000;
const attemptLimit = 5;

interface AdminChallengeInsertion {
  readonly id: string;
  readonly userId: string;
  readonly otpChallengeId: string;
  readonly transport: AuthTransport;
  readonly now: Date;
}

interface AdminVerification {
  readonly challengeId: string;
  readonly transport: AuthTransport;
  readonly now: Date;
  readonly matchTotp: (secretEncrypted: Uint8Array, userId: string) => number | undefined;
  readonly attempt?: VerificationAttempt;
}

interface StoredChallenge {
  readonly transport: AuthTransport;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attempts: number;
  readonly secretEncrypted: Uint8Array;
}

type AdminAttemptResult =
  | { readonly kind: "verified"; readonly userId: string }
  | { readonly kind: "invalid" | "locked" | "replayed" };

type AdminVerificationResult =
  AdminAttemptResult | { readonly kind: "expired" | "consumed" | "idempotency_conflict" };

export async function insertAdminChallenge(
  sql: TransactionSql,
  { id, userId, otpChallengeId, transport, now }: AdminChallengeInsertion,
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + challengeLifetimeMs);
  const result = await sql`
    INSERT INTO public.admin_challenges (id, user_id, otp_challenge_id, transport, created_at, expires_at)
    SELECT ${id}::uuid, account.id, otp.id, ${transport},
      ${now.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz
    FROM public.users AS account
    JOIN public.admins AS admin ON admin.user_id = account.id
    JOIN public.otp_challenges AS otp ON otp.phone_e164 = account.phone_e164
    WHERE account.id = ${userId} AND account.blocked_at IS NULL AND account.deleted_at IS NULL
      AND otp.id = ${otpChallengeId} AND otp.purpose = 'admin_sign_in' AND otp.consumed_at IS NOT NULL
    ON CONFLICT (otp_challenge_id) DO NOTHING
  `;
  return result.count === 1;
}

async function lockAdminUser(
  sql: TransactionSql,
  challengeId: string,
): Promise<string | undefined> {
  // Lock the user before the factor rows, in the same order as session issuance.
  const [account] = await sql<{ id: string }[]>`
    SELECT account.id FROM public.users AS account
    JOIN public.admin_challenges AS challenge ON challenge.user_id = account.id
    WHERE challenge.id = ${challengeId} AND account.blocked_at IS NULL AND account.deleted_at IS NULL
    FOR UPDATE OF account
  `;
  return account?.id;
}

async function lockChallenge(
  sql: TransactionSql,
  challengeId: string,
): Promise<StoredChallenge | undefined> {
  const [challenge] = await sql<StoredChallenge[]>`
    SELECT challenge.transport, challenge.created_at AS "createdAt",
      challenge.expires_at AS "expiresAt", challenge.consumed_at AS "consumedAt",
      challenge.attempts, admin.totp_secret_encrypted AS "secretEncrypted"
    FROM public.admin_challenges AS challenge
    JOIN public.admins AS admin ON admin.user_id = challenge.user_id
    WHERE challenge.id = ${challengeId}
    FOR UPDATE OF challenge, admin
  `.parsers(authTimestampParsers);
  return challenge;
}

async function rejectAdminCode(
  sql: TransactionSql,
  { challengeId }: AdminVerification,
  attempts: number,
): Promise<{ readonly kind: "invalid" | "locked" }> {
  await sql`UPDATE public.admin_challenges SET attempts = attempts + 1 WHERE id = ${challengeId}`;
  return { kind: attempts + 1 === attemptLimit ? "locked" : "invalid" };
}

async function claimTotpStep(sql: TransactionSql, userId: string, step: number): Promise<boolean> {
  const result = await sql`
    UPDATE public.admins SET last_totp_step = ${step}
    WHERE user_id = ${userId} AND (last_totp_step IS NULL OR last_totp_step < ${step})
  `;
  return result.count === 1;
}

function getChallengeRejection(
  challenge: StoredChallenge,
  { transport, now }: AdminVerification,
): AdminVerificationResult | undefined {
  if (challenge.transport !== transport || now < challenge.createdAt) return { kind: "invalid" };
  if (challenge.consumedAt) return { kind: "consumed" };
  if (challenge.attempts >= attemptLimit) return { kind: "locked" };
  if (now >= challenge.expiresAt) return { kind: "expired" };
  return undefined;
}

async function verifyLockedAdminChallenge(
  sql: TransactionSql,
  input: AdminVerification,
  { challenge, userId }: { challenge: StoredChallenge; userId: string },
): Promise<AdminAttemptResult> {
  const { challengeId, now, matchTotp } = input;
  const step = matchTotp(challenge.secretEncrypted, userId);
  if (step === undefined || !Number.isSafeInteger(step) || step < 0)
    return rejectAdminCode(sql, input, challenge.attempts);
  if (!(await claimTotpStep(sql, userId, step))) return { kind: "replayed" };

  await sql`UPDATE public.admin_challenges SET consumed_at = ${now.toISOString()} WHERE id = ${challengeId}`;
  return { kind: "verified", userId };
}

export async function redeemAdminChallenge(
  sql: TransactionSql,
  input: AdminVerification,
): Promise<AdminVerificationResult> {
  const { challengeId, attempt } = input;
  const userId = await lockAdminUser(sql, challengeId);
  if (!userId) return { kind: "invalid" };
  const challenge = await lockChallenge(sql, challengeId);
  if (!challenge) return { kind: "invalid" };

  const receipt: VerificationReceipt = { factor: "admin", challengeId, attempt };
  const replay = await readVerificationReceipt(sql, receipt);
  if (replay) return replay;

  const rejection = getChallengeRejection(challenge, input);
  if (rejection) return rejection;

  const result = await verifyLockedAdminChallenge(sql, input, { challenge, userId });
  if (result.kind !== "replayed") await writeVerificationReceipt(sql, receipt, result.kind);
  return result;
}
