import type { merchantBoardOutput } from "@zaafran/contracts/orders";
import type { TransactionSql } from "postgres";
import type { PricedQuote } from "./order-placement-store.js";
import { orderStateColumns, orderSummaryFor, type OrderStateRow } from "./order-state-store.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Board = ReturnType<typeof merchantBoardOutput.parse>;
type Ticket = Board["orders"][number];
type StoredLine = Omit<PricedQuote["price"]["lines"][number], "note"> & { note?: string };
type TicketRow = OrderStateRow & {
  status: Ticket["status"];
  lines: StoredLine[];
  changeDzd: number;
  confirmByPhone: boolean;
};
export type ReplayEventRow = Omit<Board["events"][number], "at"> & { at: Date };
export type BoardRequest = { merchantId: string; accountId: string; after?: string | undefined };
export const replayLimit = 100;

async function readTickets(sql: TransactionSql, merchantId: string): Promise<Ticket[]> {
  const rows = await sql<TicketRow[]>`
    SELECT ${orderStateColumns(sql)}, lines, paying_with_dzd - total_dzd AS "changeDzd",
      confirm_by_phone AS "confirmByPhone"
    FROM public.orders WHERE merchant_id = ${merchantId}
      AND status IN ('pending_acceptance', 'accepted', 'ready')
    ORDER BY placed_at, id
  `.parsers(timestampParsers);

  return rows.map((row) => ({
    ...orderSummaryFor(row, {
      shortCode: row.shortCode,
      totalDzd: row.totalDzd,
      placedAt: row.placedAt.toISOString(),
    }),
    status: row.status,
    lines: row.lines.map(({ itemId, names, quantity, options, note }) => ({
      itemId,
      names,
      quantity,
      options: options.map(({ names }) => names),
      note: note ?? "",
    })),
    changeDzd: row.changeDzd,
    confirmByPhone: row.confirmByPhone,
    courierId: row.courierId,
    canHandover: row.status === "ready" && row.fulfilment === "delivery" && row.courierId !== null,
  }));
}

async function readReplay(sql: TransactionSql, { merchantId, after }: BoardRequest) {
  if (after === undefined) return [];
  return sql<ReplayEventRow[]>`
    SELECT merchant_sequence::text AS id, order_id AS "orderId", version, to_status AS status, occurred_at AS at
    FROM public.order_events WHERE merchant_id = ${merchantId} AND merchant_sequence > ${after}::bigint
    ORDER BY merchant_sequence LIMIT ${replayLimit + 1}
  `.parsers(timestampParsers);
}

async function readBoardCursor(
  sql: TransactionSql,
  request: BoardRequest,
  sessionId: string | null,
) {
  const { merchantId, accountId } = request;
  const [access] = await sql<{ cursor: string }[]>`
    SELECT coalesce(stream.latest, 0)::text AS cursor
    FROM public.merchant_members AS member
    JOIN public.users AS account ON account.id = member.user_id
      AND account.deleted_at IS NULL AND account.blocked_at IS NULL
    LEFT JOIN public.merchant_order_streams AS stream ON stream.merchant_id = member.merchant_id
    WHERE member.user_id = ${accountId} AND member.merchant_id = ${merchantId}
      AND (${sessionId}::uuid IS NULL OR EXISTS (
        SELECT FROM public.sessions AS session WHERE session.id = ${sessionId}::uuid
          AND session.user_id = member.user_id AND session.kind = 'standard'
          AND session.revoked_at IS NULL AND session.expires_at > statement_timestamp()
      ))
  `;
  return access?.cursor;
}

export function presentReplayPage(rows: readonly ReplayEventRow[], currentCursor: string) {
  const events = rows
    .slice(0, replayLimit)
    .map(({ at, ...event }) => ({ ...event, at: at.toISOString() }));
  return {
    events,
    cursor: events.at(-1)?.id ?? currentCursor,
    hasMore: rows.length > replayLimit,
  };
}

async function readDeliveryProofs(sql: TransactionSql, merchantId: string) {
  type Proof = NonNullable<Board["deliveryProofs"]>[number];
  const rows = await sql<(Omit<Proof, "at"> & { at: Date })[]>`
    SELECT proof.order_id AS "orderId", proof.photo_id AS "photoId", proof.reason,
      delivery.short_code AS "shortCode", proof.submitted_at AS at
    FROM public.order_delivery_photo_proofs AS proof
    JOIN public.orders AS delivery ON delivery.id = proof.order_id AND delivery.customer_id IS NOT NULL
    JOIN public.media_uploads AS upload ON upload.id = proof.photo_id AND NOT upload.delivery_proof_purging
    WHERE proof.merchant_id = ${merchantId}
    ORDER BY proof.submitted_at DESC, proof.order_id LIMIT 20
  `.parsers(timestampParsers);
  return rows.map(({ at, ...proof }) => ({ ...proof, at: at.toISOString() }));
}

export async function readMerchantBoard(
  sql: TransactionSql,
  request: BoardRequest,
): Promise<Board | undefined> {
  const cursor = await readBoardCursor(sql, request, null);
  if (cursor === undefined) return undefined;
  const [orders, rows, deliveryProofs] = await Promise.all([
    readTickets(sql, request.merchantId),
    readReplay(sql, request),
    readDeliveryProofs(sql, request.merchantId),
  ]);
  return {
    orders,
    ...presentReplayPage(rows, cursor),
    ...(deliveryProofs.length ? { deliveryProofs } : {}),
  };
}

export type ReplayRequest = BoardRequest & { sessionId: string };

export async function readMerchantReplay(sql: TransactionSql, request: ReplayRequest) {
  const cursor = await readBoardCursor(sql, request, request.sessionId);
  if (cursor === undefined) return undefined;
  return presentReplayPage(await readReplay(sql, request), cursor);
}
