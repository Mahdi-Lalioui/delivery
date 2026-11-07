import type { TransactionSql } from "postgres";

export async function lockMerchantAdmin(
  sql: TransactionSql,
  id: string,
): Promise<string | undefined> {
  // TOTP and review take the account lock before the admin lock.
  const [account] = await sql<{ id: string }[]>`
    SELECT id FROM public.users
    WHERE id = ${id} AND blocked_at IS NULL AND deleted_at IS NULL FOR SHARE
  `;
  if (!account) return undefined;
  const [admin] = await sql`
    SELECT user_id FROM public.admins WHERE user_id = ${account.id} FOR SHARE
  `;
  return admin ? account.id : undefined;
}
