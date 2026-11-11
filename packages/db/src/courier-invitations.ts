import type { TransactionSql } from "postgres";
import { lockOtpPhone } from "./auth-otp-lock.js";
import { readPrivacyPhone } from "./privacy-account.js";
import { timestampParsers } from "./timestamp-parsers.js";

export type CourierScope = { userId: string; sessionId: string };
export type InviteRequest = CourierScope & { merchantId: string; phone: string; now: Date };
export type AcceptRequest = CourierScope & {
  inviteId: string;
  displayName?: string | undefined;
  now: Date;
};
type Invitation = { inviteId: string; expiresAt: Date };
type Courier = { courierId: string; merchantId: string };
const invitationLifetime = 7 * 24 * 60 * 60 * 1000;

function inviteReceipt({ inviteId, expiresAt }: Invitation) {
  return { kind: "invited", invite: { inviteId, expiresAt: expiresAt.toISOString() } } as const;
}

async function canInvite(
  sql: TransactionSql,
  { userId, merchantId, sessionId, now }: InviteRequest,
) {
  const [member] = await sql`
    SELECT FROM public.merchant_members AS member
    JOIN public.merchants AS merchant ON merchant.id = member.merchant_id AND NOT merchant.is_demo
      AND merchant.status IN ('approved', 'active', 'paused')
    JOIN public.users AS account ON account.id = member.user_id
      AND account.deleted_at IS NULL AND account.blocked_at IS NULL
    JOIN public.sessions AS session ON session.user_id = member.user_id
      AND session.id = ${sessionId} AND session.kind = 'standard' AND session.revoked_at IS NULL
      AND session.expires_at > ${now.toISOString()}
    WHERE member.user_id = ${userId} AND member.merchant_id = ${merchantId} AND member.role = 'owner'
    FOR SHARE OF member, merchant
  `;
  return member !== undefined;
}

async function createInvitation(
  sql: TransactionSql,
  { merchantId, userId, phone, now }: InviteRequest,
) {
  const timestamp = now.toISOString();
  await sql`
    UPDATE public.courier_invitations SET revoked_at = ${timestamp}
    WHERE merchant_id = ${merchantId} AND phone_e164 = ${phone}
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= ${timestamp}
  `;
  const [invite] = await sql<Invitation[]>`
    INSERT INTO public.courier_invitations (merchant_id, invited_by, phone_e164, created_at, expires_at)
    VALUES (${merchantId}, ${userId}, ${phone}, ${timestamp},
      ${new Date(now.getTime() + invitationLifetime).toISOString()})
    ON CONFLICT (merchant_id, phone_e164) WHERE accepted_at IS NULL AND revoked_at IS NULL
    DO UPDATE SET expires_at = courier_invitations.expires_at
    RETURNING id AS "inviteId", expires_at AS "expiresAt"
  `.parsers(timestampParsers);
  if (!invite) throw new Error("Invitation insert returned no row");
  return inviteReceipt(invite);
}

export async function inviteCourier(sql: TransactionSql, request: InviteRequest) {
  await lockOtpPhone(sql, request.phone);
  if (!(await canInvite(sql, request))) return { kind: "not_found" } as const;
  const [registered] = await sql`
    SELECT FROM public.couriers AS courier JOIN public.users AS account ON account.id = courier.user_id
    WHERE account.phone_e164 = ${request.phone} AND courier.active
  `;
  if (registered) return { kind: "courier_already_registered" } as const;
  return createInvitation(sql, request);
}

async function lockInvitePhone(sql: TransactionSql, request: AcceptRequest) {
  const phone = await readPrivacyPhone(sql, request);
  if (!phone) return undefined;
  await lockOtpPhone(sql, phone);
  await sql`SELECT FROM public.users WHERE id = ${request.userId} FOR UPDATE`;
  const current = await readPrivacyPhone(sql, request);
  return current === phone ? phone : undefined;
}

async function activateCourier(sql: TransactionSql, request: AcceptRequest, merchantId: string) {
  const [courier] = await sql<Courier[]>`
    INSERT INTO public.couriers (user_id, merchant_id, display_name, created_at)
    VALUES (${request.userId}, ${merchantId}, ${request.displayName ?? null}, ${request.now.toISOString()})
    ON CONFLICT (user_id) DO UPDATE SET display_name = coalesce(excluded.display_name, couriers.display_name)
    WHERE couriers.merchant_id = excluded.merchant_id AND couriers.active
    RETURNING id AS "courierId", merchant_id AS "merchantId"
  `;
  return courier;
}

export async function acceptCourierInvitation(sql: TransactionSql, request: AcceptRequest) {
  const phone = await lockInvitePhone(sql, request);
  if (!phone) return { kind: "unauthorized" } as const;
  const [invite] = await sql<{ merchantId: string; acceptedBy: string | null; expired: boolean }[]>`
    SELECT invite.merchant_id AS "merchantId", invite.accepted_by AS "acceptedBy",
      (invite.expires_at <= ${request.now.toISOString()}) AS expired
    FROM public.courier_invitations AS invite
    JOIN public.merchants AS merchant ON merchant.id = invite.merchant_id AND NOT merchant.is_demo
      AND merchant.status IN ('approved', 'active', 'paused')
    WHERE invite.id = ${request.inviteId} AND invite.phone_e164 = ${phone} AND invite.revoked_at IS NULL
    FOR UPDATE OF invite
  `;
  if (!invite) return { kind: "not_found" } as const;
  if (invite.acceptedBy !== null && invite.acceptedBy !== request.userId)
    return { kind: "not_found" } as const;
  if (invite.acceptedBy === null && invite.expired) return { kind: "invite_expired" } as const;

  const courier = await activateCourier(sql, request, invite.merchantId);
  if (!courier) return { kind: "courier_already_registered" } as const;
  if (invite.acceptedBy === null) {
    await sql`
      UPDATE public.courier_invitations SET accepted_by = ${request.userId}, accepted_at = ${request.now.toISOString()}
      WHERE id = ${request.inviteId}
    `;
  }
  return { kind: "accepted", courier } as const;
}
