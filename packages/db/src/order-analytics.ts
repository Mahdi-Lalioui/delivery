import type {
  adminDashboardTodayOutput,
  merchantAnalyticsOutput,
} from "@zaafran/contracts/retention";
import type { TransactionSql } from "postgres";
import { lockMerchantAdmin } from "./merchant-access.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { activeStandardSession } from "./standard-session.js";

type MerchantAnalytics = ReturnType<typeof merchantAnalyticsOutput.parse>;
type Dashboard = ReturnType<typeof adminDashboardTodayOutput.parse>;
type Window = { from: string; to: string; merchantId?: string };

function analyticsCohort(sql: TransactionSql, { from, to, merchantId }: Window) {
  return sql`
    cohort AS (
      SELECT orders.id, orders.customer_id, orders.merchant_id, orders.status, orders.placed_at,
        orders.subtotal_dzd, orders.lines
      FROM public.orders AS orders JOIN public.merchants AS merchant ON merchant.id = orders.merchant_id
      WHERE orders.order_day BETWEEN ${from}::date AND ${to}::date AND NOT merchant.is_demo
        ${merchantId ? sql`AND orders.merchant_id = ${merchantId}` : sql``}
    ),
    milestones AS (
      SELECT event.order_id,
        min(event.occurred_at) FILTER (WHERE event.to_status = 'accepted') AS accepted_at,
        min(event.occurred_at) FILTER (WHERE event.to_status = 'ready') AS ready_at,
        min(event.occurred_at) FILTER (WHERE event.to_status = 'out_for_delivery') AS started_at,
        min(event.occurred_at) FILTER (WHERE event.to_status = 'delivered') AS delivered_at
      FROM cohort JOIN public.order_events AS event ON event.order_id = cohort.id
      GROUP BY event.order_id
    ),
    cancellations AS (
      SELECT status::text AS reason, count(*)::int AS orders
      FROM cohort WHERE status IN ('cancelled', 'rejected', 'expired', 'delivery_failed')
      GROUP BY status
    ),
    totals AS (
      SELECT count(*)::int AS orders,
        coalesce(sum(subtotal_dzd) FILTER (WHERE status IN ('delivered', 'collected')), 0) AS "salesDzd",
        coalesce(round(avg(subtotal_dzd) FILTER (WHERE status IN ('delivered', 'collected'))), 0) AS "averageTicketDzd",
        coalesce(round(count(accepted_at) * 10000.0 / nullif(count(*) FILTER (
          WHERE accepted_at IS NOT NULL OR status IN ('rejected', 'expired')), 0)), 0) AS "acceptanceRate",
        coalesce(round(avg(extract(epoch FROM (ready_at - accepted_at)))), 0) AS "avgPrepSeconds",
        coalesce(round(avg(extract(epoch FROM (delivered_at - started_at)))), 0) AS "avgDeliverySeconds"
      FROM cohort LEFT JOIN milestones ON milestones.order_id = cohort.id
    )
  `;
}

const cancellationRows = (sql: TransactionSql) =>
  sql`coalesce((SELECT jsonb_agg(to_jsonb(cancellations) ORDER BY orders DESC, reason) FROM cancellations), '[]'::jsonb)`;

export async function readMerchantAnalytics(
  sql: TransactionSql,
  scope: MenuScope & { sessionId: string; from: string; to: string },
) {
  const [session] = await sql`
    SELECT WHERE ${activeStandardSession(sql, { userId: scope.accountId, sessionId: scope.sessionId })}
  `;
  if (!session || !(await readMenuContext(sql, scope))) return undefined;
  const [result] = await sql<MerchantAnalytics[]>`
    WITH ${analyticsCohort(sql, scope)},
    repeat_buyers AS (
      SELECT customer_id, count(*) AS completed FROM cohort
      WHERE customer_id IS NOT NULL AND status IN ('delivered', 'collected') GROUP BY customer_id
    ),
    sold_items AS (
      SELECT line->>'itemId' AS "itemId", (array_agg(line->'names' ORDER BY cohort.placed_at DESC))[1] AS names,
        sum((line->>'quantity')::int) AS quantity,
        sum((line->>'quantity')::int * ((line->>'unitPriceDzd')::bigint + coalesce(
          (SELECT sum((option->>'priceDeltaDzd')::int) FROM jsonb_array_elements(line->'options') AS option), 0
        ))) AS "salesDzd"
      FROM cohort CROSS JOIN LATERAL jsonb_array_elements(cohort.lines) AS line
      WHERE cohort.status IN ('delivered', 'collected') GROUP BY line->>'itemId'
      ORDER BY quantity DESC, "itemId" LIMIT 10
    ),
    hours AS (
      SELECT extract(isodow FROM placed_at AT TIME ZONE 'Africa/Algiers')::int AS weekday,
        extract(hour FROM placed_at AT TIME ZONE 'Africa/Algiers')::int AS hour, count(*)::int AS orders
      FROM cohort GROUP BY weekday, hour
    ),
    weekdays AS (
      SELECT weekday, jsonb_agg(coalesce(hours.orders, 0) ORDER BY hour) AS cells
      FROM generate_series(1, 7) AS days(weekday) CROSS JOIN generate_series(0, 23) AS times(hour)
      LEFT JOIN hours USING (weekday, hour) GROUP BY weekday
    )
    SELECT (SELECT to_jsonb(totals) FROM totals) AS totals, ${cancellationRows(sql)} AS cancellations,
      coalesce((SELECT jsonb_agg(to_jsonb(sold_items) ORDER BY quantity DESC, "itemId") FROM sold_items), '[]'::jsonb) AS "topItems",
      (SELECT jsonb_agg(cells ORDER BY weekday) FROM weekdays) AS heatmap,
      coalesce((SELECT round(count(*) FILTER (WHERE completed > 1) * 10000.0 / nullif(count(*), 0))::int FROM repeat_buyers), 0) AS "repeatCustomerRate"
  `;
  return result;
}

async function readJobBacklog(sql: TransactionSql, now: Date) {
  const [schema] = await sql<{ ready: boolean }[]>`
    SELECT to_regclass('graphile_worker.jobs') IS NOT NULL AS ready
  `;
  if (!schema?.ready) return 0;
  const [jobs] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM graphile_worker.jobs
    WHERE run_at <= ${now.toISOString()} AND locked_at IS NULL AND attempts < max_attempts
  `;
  return jobs?.count ?? 0;
}

export async function readAdminDashboard(
  sql: TransactionSql,
  {
    accountId,
    date,
    now,
    errorRate,
  }: { accountId: string; date: string; now: Date; errorRate: number },
): Promise<Dashboard | undefined> {
  if (!(await lockMerchantAdmin(sql, accountId))) return undefined;
  const [result] = await sql<
    Pick<Dashboard, "totals" | "cancellations" | "unresponsiveRestaurants">[]
  >`
    WITH ${analyticsCohort(sql, { from: date, to: date })}
    SELECT (SELECT to_jsonb(totals) FROM totals) AS totals, ${cancellationRows(sql)} AS cancellations,
      (SELECT count(*)::int FROM (
        SELECT merchant_id FROM cohort WHERE status = 'expired' GROUP BY merchant_id HAVING count(*) >= 3
      ) AS unresponsive) AS "unresponsiveRestaurants"
  `;
  return result && { ...result, errorRate, jobBacklog: await readJobBacklog(sql, now) };
}
