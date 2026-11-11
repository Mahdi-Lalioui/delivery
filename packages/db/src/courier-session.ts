import type { ISql } from "postgres";
import type { CourierScope } from "./courier-invitations.js";

export function activeCourierSession(sql: ISql, { userId, sessionId }: CourierScope) {
  return sql`EXISTS (
    SELECT FROM public.sessions AS session JOIN public.users AS account ON account.id = session.user_id
    WHERE session.id = ${sessionId} AND session.user_id = ${userId} AND session.kind = 'standard'
      AND session.revoked_at IS NULL AND session.expires_at > statement_timestamp()
      AND account.deleted_at IS NULL AND account.blocked_at IS NULL
  )`;
}
