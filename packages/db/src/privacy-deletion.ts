import type { ISql, TransactionSql } from "postgres";
import { lockOtpPhone } from "./auth-otp-lock.js";
import type { AuthTransport } from "./auth-types.js";
import {
  lockDeletableAccount,
  matchesDeletionDigest,
  type PrivacyScope,
} from "./privacy-account.js";
import { queueErasureMedia } from "./privacy-media.js";

const attemptLimit = 5;
const replayLifetimeMs = 300_000;

interface DeletionInput {
  readonly challengeId: string;
  readonly codeHmac: Uint8Array;
  readonly now: Date;
}

interface ConfirmDeletion extends DeletionInput, PrivacyScope {}

interface ReplayDeletion extends DeletionInput {
  readonly tokenHash: Uint8Array;
  readonly transport: AuthTransport;
}

interface Proof {
  readonly userId: string;
  readonly sessionId: string;
  readonly tokenHash: Uint8Array;
  readonly transport: AuthTransport;
  readonly codeHmac: Uint8Array;
}

type DeletionResult = "deleted" | "invalid_code" | "challenge_expired" | "unauthorized";

async function readProof(
  sql: ISql,
  { challengeId, codeHmac, now }: DeletionInput,
): Promise<Proof | undefined> {
  const timestamp = now.toISOString();
  const [proof] = await sql<Proof[]>`
    SELECT session.user_id AS "userId", session.id AS "sessionId", session.transport,
      session.token_hash AS "tokenHash", proof.code_hmac AS "codeHmac"
    FROM public.account_deletion_proofs AS proof
    JOIN public.account_deletion_challenges AS challenge ON challenge.id = proof.challenge_id
    JOIN public.sessions AS session ON session.id = proof.session_id AND session.user_id = challenge.user_id
    WHERE proof.challenge_id = ${challengeId} AND proof.deleted_at <= ${timestamp}
      AND proof.expires_at > ${timestamp} AND session.revoked_at IS NOT NULL
  `;
  return proof && matchesDeletionDigest(proof.codeHmac, codeHmac) ? proof : undefined;
}

export async function replayDeletion(sql: ISql, input: ReplayDeletion): Promise<boolean> {
  const proof = await readProof(sql, input);
  return (
    proof !== undefined &&
    proof.transport === input.transport &&
    matchesDeletionDigest(proof.tokenHash, input.tokenHash)
  );
}

async function lockAccountForDeletion(sql: TransactionSql, input: ConfirmDeletion) {
  const [account] = await sql<{ phone: string }[]>`
    SELECT phone_e164 AS phone FROM public.users
    WHERE id = ${input.userId} AND deleted_at IS NULL AND blocked_at IS NULL
  `;
  if (!account) return undefined;
  // Sign-in challenge reservation and redemption both take this lock before touching the account.
  await lockOtpPhone(sql, account.phone);
  const phone = await lockDeletableAccount(sql, input);
  return phone === account.phone ? phone : undefined;
}

async function clearPersonalData(
  sql: TransactionSql,
  { userId, now }: ConfirmDeletion,
  phoneE164: string,
): Promise<void> {
  await sql`
    UPDATE public.sessions
    SET revoked_at = coalesce(revoked_at, ${now.toISOString()}::timestamptz),
      device_name = NULL, request_ip = NULL
    WHERE user_id = ${userId}
  `;
  await sql`
    WITH discarded AS (
      DELETE FROM public.otp_challenges WHERE phone_e164 = ${phoneE164}
      RETURNING phone_e164, request_ip, requested_at
    )
    INSERT INTO public.auth_otp_rate_history (phone_hash, ip_hash, requested_at)
    SELECT public.auth_otp_rate_digest('phone', phone_e164),
      public.auth_otp_rate_digest('ip', host(request_ip)), requested_at
    FROM discarded WHERE requested_at > ${now.toISOString()}::timestamptz - interval '24 hours'
  `;
  await sql`
    UPDATE public.ratings SET comment = NULL
    WHERE order_id IN (SELECT id FROM public.orders WHERE customer_id = ${userId})
  `;
  await sql`
    UPDATE public.orders SET customer_id = NULL, address_snapshot = NULL, lines = (
      SELECT coalesce(jsonb_agg(line - 'note' ORDER BY index), '[]'::jsonb)
      FROM jsonb_array_elements(lines) WITH ORDINALITY AS item(line, index)
    ) WHERE customer_id = ${userId}
  `;
  await sql`UPDATE public.order_events SET actor_id = NULL, payload = payload - 'reason'
    WHERE actor_id = ${userId} AND actor_kind = 'customer'`;
  await sql`DELETE FROM public.order_action_receipts WHERE actor_id = ${userId}`;
  await sql`DELETE FROM public.order_placement_receipts WHERE customer_id = ${userId}`;
  await sql`DELETE FROM public.push_subscriptions WHERE user_id = ${userId}`;
  await sql`DELETE FROM public.quotes WHERE customer_id = ${userId}`;
  await sql`DELETE FROM public.addresses WHERE user_id = ${userId}`;
  await sql`DELETE FROM public.courier_invitations WHERE phone_e164 = ${phoneE164}`;
  await sql`UPDATE public.couriers SET display_name = NULL, online = false WHERE user_id = ${userId}`;
  await sql`DELETE FROM public.merchant_staff_invitations WHERE phone_e164 = ${phoneE164}`;
  await sql`UPDATE public.promotion_redemptions SET customer_id = NULL WHERE customer_id = ${userId}`;
  await sql`
    UPDATE public.account_deletion_challenges SET key_hash = NULL, code_hmac = NULL
    WHERE user_id = ${userId}
  `;
  await sql`
    UPDATE public.users SET phone_e164 = NULL, deleted_at = ${now.toISOString()} WHERE id = ${userId}
  `;
}

async function recordDeletion(
  sql: TransactionSql,
  { userId, challengeId, sessionId, codeHmac, now }: ConfirmDeletion,
): Promise<void> {
  const expiresAt = new Date(now.getTime() + replayLifetimeMs);
  await sql`
    INSERT INTO public.account_deletion_proofs (challenge_id, session_id, code_hmac, deleted_at, expires_at)
    VALUES (${challengeId}, ${sessionId}, ${codeHmac}, ${now.toISOString()}, ${expiresAt.toISOString()})
  `;
  await sql`
    INSERT INTO public.account_deletion_audit (user_id, created_at)
    VALUES (${userId}, ${now.toISOString()})
  `;
}

async function confirmChallenge(
  sql: TransactionSql,
  { userId, challengeId, codeHmac, now }: ConfirmDeletion,
): Promise<"verified" | "invalid_code" | "challenge_expired"> {
  const timestamp = now.toISOString();
  const [challenge] = await sql<{ codeHmac: Uint8Array; attempts: number }[]>`
    SELECT code_hmac AS "codeHmac", attempts
    FROM public.account_deletion_challenges
    WHERE id = ${challengeId} AND user_id = ${userId} AND code_hmac IS NOT NULL
      AND delivered_at <= ${timestamp} AND expires_at > ${timestamp}
      AND attempts < ${attemptLimit}
    FOR UPDATE
  `;
  if (!challenge) return "challenge_expired";
  if (matchesDeletionDigest(challenge.codeHmac, codeHmac)) return "verified";

  await sql`UPDATE public.account_deletion_challenges SET attempts = attempts + 1 WHERE id = ${challengeId}`;
  return challenge.attempts + 1 === attemptLimit ? "challenge_expired" : "invalid_code";
}

export async function deleteAccount(
  sql: TransactionSql,
  input: ConfirmDeletion,
): Promise<DeletionResult> {
  const phone = await lockAccountForDeletion(sql, input);
  if (!phone) {
    const proof = await readProof(sql, input);
    return proof?.userId === input.userId && proof.sessionId === input.sessionId
      ? "deleted"
      : "unauthorized";
  }

  const verdict = await confirmChallenge(sql, input);
  if (verdict !== "verified") return verdict;

  await clearPersonalData(sql, input, phone);
  await recordDeletion(sql, input);
  await queueErasureMedia(sql, input.userId);
  return "deleted";
}
