import type { TransactionSql } from "postgres";

export interface MenuScope {
  readonly accountId: string;
  readonly merchantId: string;
}

interface MenuRevision {
  readonly revision: number;
}

export async function readMenuRevision(
  sql: TransactionSql,
  { accountId, merchantId }: MenuScope,
): Promise<number | undefined> {
  const [menu] = await sql<MenuRevision[]>`
    SELECT merchant.menu_revision::double precision AS revision
    FROM public.merchants AS merchant
    JOIN public.merchant_members AS member ON member.merchant_id = merchant.id
    JOIN public.users AS account ON account.id = member.user_id
    WHERE merchant.id = ${merchantId} AND account.id = ${accountId}
      AND merchant.status IN ('approved', 'active', 'paused')
      AND member.role IN ('owner', 'manager')
      AND account.blocked_at IS NULL AND account.deleted_at IS NULL
  `;
  return menu?.revision;
}

export async function lockEditableMenu(
  sql: TransactionSql,
  { accountId, merchantId }: MenuScope,
  access: "editor" | "availability",
): Promise<number | undefined> {
  const allowStaff = access === "availability";
  const [account] = await sql`
    SELECT id FROM public.users
    WHERE id = ${accountId} AND blocked_at IS NULL AND deleted_at IS NULL FOR SHARE
  `;
  if (!account) return undefined;

  // Check the candidate membership before locking the merchant to avoid contention across tenants.
  const [menu] = await sql<MenuRevision[]>`
    SELECT menu_revision::double precision AS revision FROM public.merchants
    WHERE id = ${merchantId} AND status IN ('approved', 'active', 'paused')
      AND EXISTS (
        SELECT FROM public.merchant_members
        WHERE merchant_id = ${merchantId} AND user_id = ${accountId}
          AND (role IN ('owner', 'manager') OR (${allowStaff} AND role = 'staff'))
      )
    FOR NO KEY UPDATE
  `;
  if (!menu) return undefined;

  const [member] = await sql`
    SELECT role FROM public.merchant_members
    WHERE merchant_id = ${merchantId} AND user_id = ${accountId}
      AND (role IN ('owner', 'manager') OR (${allowStaff} AND role = 'staff'))
    FOR SHARE
  `;
  return member ? menu.revision : undefined;
}
