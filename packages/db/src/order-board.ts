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
type BoardEvent = Omit<Board["events"][number], "at"> & { at: Date };
export type BoardRequest = { merchantId: string; accountId: string; after?: string };
const replayLimit = 100;

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
  }));
}

async function readReplay(sql: TransactionSql, { merchantId, after }: BoardRequest) {
  if (after === undefined) return [];
  return sql<BoardEvent[]>`
    SELECT merchant_sequence::text AS id, order_id AS "orderId", version, to_status AS status, occurred_at AS at
    FROM public.order_events WHERE merchant_id = ${merchantId} AND merchant_sequence > ${after}::bigint
    ORDER BY merchant_sequence LIMIT ${replayLimit + 1}
  `.parsers(timestampParsers);
}

export async function readMerchantBoard(
  sql: TransactionSql,
  request: BoardRequest,
): Promise<Board | undefined> {
  const { merchantId, accountId } = request;
  const [access] = await sql<{ cursor: string }[]>`
    SELECT coalesce(stream.latest, 0)::text AS cursor
    FROM public.merchant_members AS member
    JOIN public.users AS account ON account.id = member.user_id
      AND account.deleted_at IS NULL AND account.blocked_at IS NULL
    LEFT JOIN public.merchant_order_streams AS stream ON stream.merchant_id = member.merchant_id
    WHERE member.user_id = ${accountId} AND member.merchant_id = ${merchantId}
  `;
  if (!access) return undefined;
  const [orders, rows] = await Promise.all([
    readTickets(sql, merchantId),
    readReplay(sql, request),
  ]);
  const events = rows
    .slice(0, replayLimit)
    .map(({ at, ...event }) => ({ ...event, at: at.toISOString() }));
  return {
    orders,
    events,
    cursor: events.at(-1)?.id ?? access.cursor,
    hasMore: rows.length > replayLimit,
  };
}
