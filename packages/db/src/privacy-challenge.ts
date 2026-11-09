import type { TransactionSql } from "postgres";
import { normalizeOtpIp } from "./auth-otp-lock.js";
import { lockDeletableAccount, type PrivacyScope } from "./privacy-account.js";
import { timestampParsers } from "./timestamp-parsers.js";

const lifetimeMs = 300_000;

interface ChallengeScope extends PrivacyScope {
  readonly challengeId: string;
}

interface IssueChallenge extends ChallengeScope {
  readonly requestIp: string;
  readonly hashRequestIp: (normalizedIp: string) => Uint8Array;
  readonly keyHash: Uint8Array;
  readonly codeHmac: Uint8Array;
}

type ChallengeResult =
  | {
      readonly kind: "issued";
      readonly challengeId: string;
      readonly phoneE164: string;
      readonly expiresAt: Date;
      readonly needsDelivery: boolean;
    }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number }
  | { readonly kind: "unauthorized" };

interface DeliverChallenge extends ChallengeScope {
  readonly send: (phoneE164: string) => Promise<void> | void;
}

async function findRetryAt(
  sql: TransactionSql,
  { userId, now }: IssueChallenge,
  ipHash: Uint8Array,
): Promise<Date | null | undefined> {
  const timestamp = now.toISOString();
  const [limits] = await sql<{ retryAt: Date | null }[]>`
    WITH account_requests AS (
      SELECT requested_at FROM public.account_deletion_challenges
      WHERE user_id = ${userId} AND requested_at > ${timestamp}::timestamptz - interval '24 hours'
      ORDER BY requested_at DESC LIMIT 10
    ),
    ip_requests AS (
      SELECT requested_at FROM public.account_deletion_challenges
      WHERE ip_hash = ${ipHash} AND requested_at > ${timestamp}::timestamptz - interval '1 hour'
      ORDER BY requested_at DESC LIMIT 20
    )
    SELECT greatest(
      (SELECT requested_at + interval '45 seconds' FROM account_requests ORDER BY requested_at DESC LIMIT 1),
      (SELECT requested_at + interval '15 minutes' FROM account_requests ORDER BY requested_at DESC OFFSET 2 LIMIT 1),
      (SELECT requested_at + interval '24 hours' FROM account_requests ORDER BY requested_at DESC OFFSET 9 LIMIT 1),
      (SELECT requested_at + interval '1 hour' FROM ip_requests ORDER BY requested_at DESC OFFSET 19 LIMIT 1)
    ) AS "retryAt"
  `.parsers(timestampParsers);
  return limits?.retryAt;
}

async function findReceipt(sql: TransactionSql, { userId, keyHash, now }: IssueChallenge) {
  const timestamp = now.toISOString();
  const [receipt] = await sql<{ challengeId: string; expiresAt: Date; needsDelivery: boolean }[]>`
    SELECT id AS "challengeId", expires_at AS "expiresAt", delivered_at IS NULL AS "needsDelivery"
    FROM public.account_deletion_challenges
    WHERE user_id = ${userId} AND key_hash = ${keyHash}
      AND requested_at <= ${timestamp} AND expires_at > ${timestamp}
    ORDER BY expires_at DESC LIMIT 1
  `.parsers(timestampParsers);
  return receipt;
}

export async function issueDeletionChallenge(
  sql: TransactionSql,
  input: IssueChallenge,
): Promise<ChallengeResult> {
  const phoneE164 = await lockDeletableAccount(sql, input);
  if (!phoneE164) return { kind: "unauthorized" };
  const receipt = await findReceipt(sql, input);
  if (receipt) return { kind: "issued", phoneE164, ...receipt };

  const { challengeId, userId, now, codeHmac, keyHash, hashRequestIp, requestIp } = input;
  const ipHash = hashRequestIp(await normalizeOtpIp(sql, requestIp));
  // All issuances take the account lock before the IP lock.
  await sql`SELECT pg_advisory_xact_lock(63842, hashtext(encode(${ipHash}::bytea, 'hex')))`;
  const retryAt = await findRetryAt(sql, input, ipHash);
  if (retryAt && retryAt > now) {
    return { kind: "rate_limited", retryAfterSeconds: Math.ceil((+retryAt - +now) / 1000) };
  }

  const expiresAt = new Date(now.getTime() + lifetimeMs);
  await sql`
    INSERT INTO public.account_deletion_challenges
      (id, user_id, ip_hash, key_hash, code_hmac, requested_at, expires_at)
    VALUES (${challengeId}, ${userId}, ${ipHash}, ${keyHash}, ${codeHmac},
      ${now.toISOString()}, ${expiresAt.toISOString()})
  `;
  return { kind: "issued", challengeId, phoneE164, expiresAt, needsDelivery: true };
}

export async function deliverDeletionChallenge(
  sql: TransactionSql,
  input: DeliverChallenge,
): Promise<boolean> {
  const phoneE164 = await lockDeletableAccount(sql, input);
  if (!phoneE164) return false;
  const { userId, challengeId, now, send } = input;
  const timestamp = now.toISOString();
  const [challenge] = await sql<{ delivered: boolean }[]>`
    SELECT delivered_at IS NOT NULL AS delivered
    FROM public.account_deletion_challenges
    WHERE id = ${challengeId} AND user_id = ${userId} AND code_hmac IS NOT NULL
      AND requested_at <= ${timestamp} AND expires_at > ${timestamp}
  `;
  if (!challenge) return false;
  if (challenge.delivered) return true;

  await send(phoneE164);
  await sql`
    UPDATE public.account_deletion_challenges SET delivered_at = ${timestamp}
    WHERE id = ${challengeId}
  `;
  return true;
}
