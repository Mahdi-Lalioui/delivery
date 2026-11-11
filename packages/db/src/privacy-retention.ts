import type { ISql } from "postgres";

export async function pruneDeletionState(sql: ISql, now: Date): Promise<void> {
  const timestamp = now.toISOString();
  // These statements run outside issuance locks, so cleanup can skip active rows.
  await sql`
    DELETE FROM public.account_deletion_proofs
    WHERE challenge_id IN (
      SELECT challenge_id FROM public.account_deletion_proofs
      WHERE expires_at <= ${timestamp} ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )
  `;
  await sql`
    UPDATE public.account_deletion_challenges SET key_hash = NULL, code_hmac = NULL
    WHERE id IN (
      SELECT id FROM public.account_deletion_challenges
      WHERE expires_at <= ${timestamp} AND (key_hash IS NOT NULL OR code_hmac IS NOT NULL)
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )
  `;
  await sql`
    DELETE FROM public.account_deletion_challenges
    WHERE id IN (
      SELECT id FROM public.account_deletion_challenges
      WHERE requested_at <= ${timestamp}::timestamptz - interval '24 hours'
      ORDER BY requested_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )
  `;
  await sql`
    DELETE FROM public.auth_otp_rate_history
    WHERE id IN (
      SELECT id FROM public.auth_otp_rate_history
      WHERE requested_at <= ${timestamp}::timestamptz - interval '24 hours'
      ORDER BY requested_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )
  `;
}
