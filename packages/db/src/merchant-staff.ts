import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";

type InvitedRole = "manager" | "staff";

interface OwnerScope {
  readonly accountId: string;
  readonly merchantId: string;
}

export interface StaffInvitationCreate extends OwnerScope {
  readonly phone: string;
  readonly role: InvitedRole;
  readonly tokenHash: Uint8Array;
  readonly idempotencyKeyHash: Uint8Array;
  readonly requestHash: Uint8Array;
  readonly now: Date;
}

interface StaffInvitation {
  readonly invitationId: string;
  readonly merchantId: string;
  readonly phoneE164: string;
  readonly role: InvitedRole;
  readonly status: "pending";
  readonly expiresAt: string;
}

type CreateResult =
  | { readonly kind: "applied" | "replayed"; readonly invitation: StaffInvitation }
  | { readonly kind: "not_found" | "idempotency_conflict" | "already_member" | "already_invited" };

const invitationDays = 7;

/** D-015: only an owner of an approved, active or paused restaurant manages its staff. */
async function lockOwnedMerchant(sql: TransactionSql, { accountId, merchantId }: OwnerScope) {
  const [account] = await sql`
    SELECT id FROM public.users
    WHERE id = ${accountId} AND blocked_at IS NULL AND deleted_at IS NULL FOR SHARE
  `;
  if (!account) return false;
  const [merchant] = await sql`
    SELECT id FROM public.merchants
    WHERE id = ${merchantId} AND status IN ('approved', 'active', 'paused')
      AND EXISTS (
        SELECT FROM public.merchant_members
        WHERE merchant_id = ${merchantId} AND user_id = ${accountId} AND role = 'owner'
      )
    FOR NO KEY UPDATE
  `;
  return merchant !== undefined;
}

async function readReplay(sql: TransactionSql, request: StaffInvitationCreate) {
  const [row] = await sql<(StaffInvitation & { matches: boolean })[]>`
    SELECT request_hash = ${request.requestHash} AS matches, id AS "invitationId",
      merchant_id AS "merchantId", phone_e164 AS "phoneE164", role, 'pending' AS status,
      to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt"
    FROM public.merchant_staff_invitations
    WHERE merchant_id = ${request.merchantId} AND invited_by = ${request.accountId}
      AND key_hash = ${request.idempotencyKeyHash}
  `;
  if (!row) return undefined;
  const { matches, ...invitation } = row;
  return matches
    ? { kind: "replayed" as const, invitation }
    : { kind: "idempotency_conflict" as const };
}

async function isMember(sql: TransactionSql, { merchantId, phone }: StaffInvitationCreate) {
  const [member] = await sql`
    SELECT FROM public.merchant_members AS member
    JOIN public.users AS account ON account.id = member.user_id
    WHERE member.merchant_id = ${merchantId} AND account.phone_e164 = ${phone}
  `;
  return member !== undefined;
}

async function insertInvitation(sql: TransactionSql, request: StaffInvitationCreate) {
  const { merchantId, phone, now } = request;
  // An expired open invitation no longer holds the phone's open slot.
  await sql`
    UPDATE public.merchant_staff_invitations SET revoked_at = ${now.toISOString()}::timestamptz
    WHERE merchant_id = ${merchantId} AND phone_e164 = ${phone}
      AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at <= ${now.toISOString()}::timestamptz
  `;
  const expiresAt = new Date(now.getTime() + invitationDays * 86_400_000).toISOString();
  const [row] = await sql<StaffInvitation[]>`
    INSERT INTO public.merchant_staff_invitations
      (merchant_id, phone_e164, role, token_hash, invited_by, key_hash, request_hash,
        created_at, expires_at)
    VALUES (${merchantId}, ${phone}, ${request.role}, ${request.tokenHash}, ${request.accountId},
      ${request.idempotencyKeyHash}, ${request.requestHash}, ${now.toISOString()}::timestamptz,
      ${expiresAt}::timestamptz)
    ON CONFLICT (merchant_id, phone_e164) WHERE consumed_at IS NULL AND revoked_at IS NULL
      DO NOTHING
    RETURNING id AS "invitationId", merchant_id AS "merchantId", phone_e164 AS "phoneE164",
      role, 'pending' AS status, to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt"
  `;
  return row;
}

async function createInvitation(
  sql: TransactionSql,
  request: StaffInvitationCreate,
): Promise<CreateResult> {
  if (!(await lockOwnedMerchant(sql, request))) return { kind: "not_found" };
  const replay = await readReplay(sql, request);
  if (replay) return replay;
  if (await isMember(sql, request)) return { kind: "already_member" };
  const invitation = await insertInvitation(sql, request);
  return invitation ? { kind: "applied", invitation } : { kind: "already_invited" };
}

async function listStaff(sql: TransactionSql, scope: OwnerScope & { readonly now: Date }) {
  const { accountId, merchantId, now } = scope;
  const [owner] = await sql`
    SELECT FROM public.merchant_members AS member
    JOIN public.merchants AS merchant ON merchant.id = member.merchant_id
    JOIN public.users AS account ON account.id = member.user_id
    WHERE member.merchant_id = ${merchantId} AND member.user_id = ${accountId}
      AND member.role = 'owner' AND merchant.status IN ('approved', 'active', 'paused')
      AND account.blocked_at IS NULL AND account.deleted_at IS NULL
  `;
  if (!owner) return undefined;
  const members = await sql<{ userId: string; phoneE164: string; role: string; isSelf: boolean }[]>`
    SELECT member.user_id AS "userId", account.phone_e164 AS "phoneE164", member.role,
      member.user_id = ${accountId} AS "isSelf"
    FROM public.merchant_members AS member
    JOIN public.users AS account ON account.id = member.user_id
    WHERE member.merchant_id = ${merchantId}
    ORDER BY array_position(array['owner', 'manager', 'staff'], member.role), member.user_id
    LIMIT 50
  `;
  const invitations = await sql<{ invitationId: string; phoneE164: string; role: InvitedRole }[]>`
    SELECT id AS "invitationId", phone_e164 AS "phoneE164", role,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt", to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt"
    FROM public.merchant_staff_invitations
    WHERE merchant_id = ${merchantId} AND consumed_at IS NULL AND revoked_at IS NULL
      AND expires_at > ${now.toISOString()}::timestamptz
    ORDER BY created_at, id
    LIMIT 50
  `;
  return { members: [...members], invitations: [...invitations] };
}

type RevokeRequest = OwnerScope & { readonly invitationId: string; readonly now: Date };

async function revokeInvitation(sql: TransactionSql, request: RevokeRequest) {
  if (!(await lockOwnedMerchant(sql, request))) return { kind: "not_found" } as const;
  const [row] = await sql`
    UPDATE public.merchant_staff_invitations
    SET revoked_at = coalesce(revoked_at, ${request.now.toISOString()}::timestamptz)
    WHERE id = ${request.invitationId} AND merchant_id = ${request.merchantId}
      AND consumed_at IS NULL
    RETURNING id
  `;
  if (row) return { kind: "revoked" } as const;
  const [consumed] = await sql`
    SELECT FROM public.merchant_staff_invitations
    WHERE id = ${request.invitationId} AND merchant_id = ${request.merchantId}
  `;
  return consumed ? ({ kind: "already_consumed" } as const) : ({ kind: "not_found" } as const);
}

export function createMerchantStaffRepository({ sql }: DatabaseConnection) {
  return {
    create: (request: StaffInvitationCreate) => sql.begin((tx) => createInvitation(tx, request)),
    list: (scope: OwnerScope & { readonly now: Date }) =>
      sql.begin("isolation level repeatable read read only", (tx) => listStaff(tx, scope)),
    revoke: (request: RevokeRequest) => sql.begin((tx) => revokeInvitation(tx, request)),
  };
}
