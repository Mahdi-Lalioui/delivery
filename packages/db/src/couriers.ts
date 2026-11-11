import type { courierRosterOutput } from "@zaafran/contracts/courier";
import type { ISql, TransactionSql } from "postgres";
import {
  acceptCourierInvitation,
  inviteCourier,
  type AcceptRequest,
  type CourierScope,
  type InviteRequest,
} from "./courier-invitations.js";
import type { DatabaseConnection } from "./database.js";

type Roster = ReturnType<typeof courierRosterOutput.parse>["couriers"];
type RosterRequest = CourierScope & { merchantId: string };
type PresenceRequest = CourierScope & { online: boolean };

function activeSession(sql: ISql, { userId, sessionId }: CourierScope) {
  return sql`EXISTS (
    SELECT FROM public.sessions AS session JOIN public.users AS account ON account.id = session.user_id
    WHERE session.id = ${sessionId} AND session.user_id = ${userId} AND session.kind = 'standard'
      AND session.revoked_at IS NULL AND session.expires_at > statement_timestamp()
      AND account.deleted_at IS NULL AND account.blocked_at IS NULL
  )`;
}

async function listCouriers(
  sql: TransactionSql,
  request: RosterRequest,
): Promise<Roster | undefined> {
  const [member] = await sql`
    SELECT FROM public.merchant_members WHERE user_id = ${request.userId} AND merchant_id = ${request.merchantId}
      AND ${activeSession(sql, request)}
  `;
  if (!member) return undefined;
  return sql<Roster>`
    SELECT id AS "courierId", display_name AS "displayName", online
    FROM public.couriers WHERE merchant_id = ${request.merchantId} AND active ORDER BY id
  `;
}

async function setCourierPresence(sql: ISql, request: PresenceRequest) {
  const changed = await sql`
    UPDATE public.couriers SET online = ${request.online}
    WHERE user_id = ${request.userId} AND active AND ${activeSession(sql, request)}
  `;
  return changed.count > 0;
}

export function createCourierRepository({ sql }: DatabaseConnection) {
  return {
    invite: (request: InviteRequest) => sql.begin((tx) => inviteCourier(tx, request)),
    accept: (request: AcceptRequest) => sql.begin((tx) => acceptCourierInvitation(tx, request)),
    list: (request: RosterRequest) =>
      sql.begin("isolation level repeatable read read only", (tx) => listCouriers(tx, request)),
    setPresence: (request: PresenceRequest) => setCourierPresence(sql, request),
  };
}
