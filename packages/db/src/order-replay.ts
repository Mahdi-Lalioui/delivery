import type { TransactionSql } from "postgres";
import { presentReplayPage, replayLimit, type ReplayEventRow } from "./order-board.js";
import { readScopedOrder, type OrderAccess } from "./order-commands.js";
import { readCustomerPosition } from "./order-tracking.js";
import { timestampParsers } from "./timestamp-parsers.js";

export type OrderReplayRequest = OrderAccess & { sessionId: string; after?: string | undefined };

export async function readOrderReplay(sql: TransactionSql, request: OrderReplayRequest) {
  const sessionKind = request.role === "admin" ? "admin" : "standard";
  const [session] = await sql`
    SELECT FROM public.sessions AS session
    JOIN public.users AS account ON account.id = session.user_id
      AND account.deleted_at IS NULL AND account.blocked_at IS NULL
    WHERE session.id = ${request.sessionId} AND session.user_id = ${request.accountId}
      AND session.kind = ${sessionKind} AND session.revoked_at IS NULL
      AND session.expires_at > statement_timestamp()
  `;
  if (!session) return undefined;
  const order = await readScopedOrder(sql, request);
  if (!order) return undefined;
  const cursor = String(order.version);
  const position =
    request.role === "customer" || request.role === "standard"
      ? await readCustomerPosition(sql, { orderId: order.orderId, customerId: request.accountId })
      : undefined;
  const frame = position ? { position } : {};
  if (request.after === undefined) return { ...presentReplayPage([], cursor), ...frame };

  const events = await sql<ReplayEventRow[]>`
    SELECT version::text AS id, order_id AS "orderId", version, to_status AS status, occurred_at AS at
    FROM public.order_events WHERE order_id = ${request.orderId} AND version > ${request.after}::bigint
    ORDER BY version LIMIT ${replayLimit + 1}
  `.parsers(timestampParsers);
  return { ...presentReplayPage(events, cursor), ...frame };
}
