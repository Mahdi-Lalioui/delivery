import { timingSafeEqual } from "node:crypto";
import type { ISql, TransactionSql } from "postgres";

export interface PrivacyScope {
  readonly userId: string;
  readonly sessionId: string;
  readonly now: Date;
}

export function matchesDeletionDigest(stored: Uint8Array, supplied: Uint8Array): boolean {
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

export async function readPrivacyPhone(
  sql: ISql,
  { userId, sessionId, now }: PrivacyScope,
): Promise<string | undefined> {
  const timestamp = now.toISOString();
  const [row] = await sql<{ phoneE164: string }[]>`
    SELECT account.phone_e164 AS "phoneE164"
    FROM public.users AS account
    JOIN public.sessions AS session ON session.user_id = account.id
    WHERE account.id = ${userId} AND account.blocked_at IS NULL AND account.deleted_at IS NULL
      AND session.id = ${sessionId} AND session.kind = 'standard'
      AND session.revoked_at IS NULL
      AND session.created_at <= ${timestamp} AND session.expires_at > ${timestamp}
  `;
  return row?.phoneE164;
}

async function lockPrivacyAccount(
  sql: TransactionSql,
  scope: PrivacyScope,
): Promise<string | undefined> {
  // Account-wide revocation and session issuance use this lock as well.
  const [account] = await sql`
    SELECT id FROM public.users
    WHERE id = ${scope.userId} AND blocked_at IS NULL AND deleted_at IS NULL
    FOR UPDATE
  `;
  if (!account) return undefined;
  return readPrivacyPhone(sql, scope);
}

export async function lockDeletableAccount(
  sql: TransactionSql,
  scope: PrivacyScope,
): Promise<string | undefined> {
  const phone = await lockPrivacyAccount(sql, scope);
  if (!phone) return undefined;
  // A normal OTP can also start a standard session for a privileged account.
  const [privileged] = await sql`
    SELECT FROM public.admins WHERE user_id = ${scope.userId}
    UNION ALL
    SELECT FROM public.merchant_members WHERE user_id = ${scope.userId}
    UNION ALL
    SELECT FROM public.couriers WHERE user_id = ${scope.userId} AND active
    LIMIT 1
  `;
  return privileged ? undefined : phone;
}
