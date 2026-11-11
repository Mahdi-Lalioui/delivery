import type {
  adminOrderDetailOutput,
  adminOrderSearchInput,
  adminOrderSearchOutput,
} from "@zaafran/contracts/admin-orders";
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import type { DatabaseConnection } from "./database.js";
import { lockMerchantAdmin } from "./merchant-access.js";
import { orderStateColumns, orderSummaryFor, type OrderStateRow } from "./order-state-store.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Search = z.infer<typeof adminOrderSearchInput>;
type SearchPage = Omit<z.infer<typeof adminOrderSearchOutput>, "sessionId">;
type Detail = Omit<z.infer<typeof adminOrderDetailOutput>, "sessionId">;
type AdminOrderRow = OrderStateRow & { restaurantName: string; precisePlacedAt: string };
type Scope = { accountId: string };
const eventLimit = 100;

function adminOrderColumns(sql: TransactionSql) {
  return sql`
    ${orderStateColumns(sql)}, restaurant_name AS "restaurantName",
    to_char(placed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "precisePlacedAt"
  `;
}

function excludeDemo(sql: TransactionSql) {
  return sql`
    EXISTS (SELECT FROM public.merchants AS merchant WHERE merchant.id = orders.merchant_id AND NOT merchant.is_demo)
  `;
}

function presentOrder(row: AdminOrderRow): Detail["order"] {
  const { restaurantName, precisePlacedAt, shortCode, totalDzd } = row;
  return {
    ...orderSummaryFor(row, { placedAt: precisePlacedAt, shortCode, totalDzd }),
    restaurantName,
  };
}

function searchFilter(sql: TransactionSql, filter: Search["filter"]) {
  switch (filter?.kind) {
    case "code":
      return sql`AND short_code = ${filter.code}`;
    case "phone":
      return sql`AND customer_id = (
        SELECT id FROM public.users WHERE phone_e164 = ${filter.phone} AND deleted_at IS NULL
      )`;
    case "restaurant": {
      const text = filter.name.replace(/[\\%_]/gu, "\\$&");
      return sql`AND restaurant_name ILIKE ${"%" + text + "%"}`;
    }
    default:
      return sql``;
  }
}

async function readOrders(sql: TransactionSql, input: Search): Promise<SearchPage> {
  const { scope, status, cursor, limit } = input;
  const live =
    scope === "live"
      ? sql`AND status IN ('scheduled', 'pending_acceptance', 'accepted', 'ready', 'out_for_delivery')`
      : sql``;
  const rows = await sql<AdminOrderRow[]>`
    SELECT ${adminOrderColumns(sql)} FROM public.orders WHERE ${excludeDemo(sql)}
      ${live} ${status ? sql`AND status = ${status}` : sql``}
      ${searchFilter(sql, input.filter)}
      ${cursor ? sql`AND (placed_at, id) < (${cursor.placedAt}::timestamptz, ${cursor.orderId}::uuid)` : sql``}
    ORDER BY placed_at DESC, id DESC
    LIMIT ${limit + 1}
  `.parsers(timestampParsers);
  const orders = rows.slice(0, limit).map(presentOrder);
  const last = orders.at(-1);
  return {
    orders,
    nextCursor:
      rows.length > limit && last ? { orderId: last.orderId, placedAt: last.placedAt } : null,
  };
}

async function readTimeline(sql: TransactionSql, orderId: string): Promise<Detail | undefined> {
  const [row] = await sql<AdminOrderRow[]>`
    SELECT ${adminOrderColumns(sql)} FROM public.orders WHERE id = ${orderId} AND ${excludeDemo(sql)}
  `.parsers(timestampParsers);
  if (!row) return undefined;
  type Event = Omit<Detail["events"][number], "at"> & { at: Date };
  const events = await sql<Event[]>`
    SELECT version, from_status AS "from", to_status AS "to", actor_kind AS actor, occurred_at AS at,
      CASE WHEN jsonb_typeof(payload->'reason') = 'string' THEN left(payload->>'reason', 500) END AS reason
    FROM public.order_events
    WHERE order_id = ${row.id} AND version <= ${row.version}
    ORDER BY version DESC LIMIT ${eventLimit + 1}
  `.parsers(timestampParsers);
  return {
    order: presentOrder(row),
    events: events
      .slice(0, eventLimit)
      .reverse()
      .map(({ at, ...event }) => ({ ...event, at: at.toISOString() })),
    hasEarlierEvents: events.length > eventLimit,
  };
}

export function createAdminOrdersRepository({ sql }: DatabaseConnection) {
  return {
    search: ({ accountId, input }: Scope & { input: Search }) =>
      sql.begin(async (tx) =>
        (await lockMerchantAdmin(tx, accountId)) ? readOrders(tx, input) : undefined,
      ),
    detail: ({ accountId, orderId }: Scope & { orderId: string }) =>
      sql.begin(async (tx) =>
        (await lockMerchantAdmin(tx, accountId)) ? readTimeline(tx, orderId) : undefined,
      ),
  };
}
