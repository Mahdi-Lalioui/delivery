import { customerPushStatus } from "@zaafran/contracts/push";
import type { orderSummary } from "@zaafran/contracts/orders";
import type { OrderEvent, OrderSnapshot } from "@zaafran/domain/order-types";
import type { TransactionSql } from "postgres";
import { timestampParsers } from "./timestamp-parsers.js";

export type OrderSummary = ReturnType<typeof orderSummary.parse>;

export const iso = (time: number | null) => (time === null ? null : new Date(time).toISOString());

export function orderSummaryFor(
  order: OrderSnapshot,
  receipt: Pick<OrderSummary, "shortCode" | "totalDzd" | "placedAt">,
): OrderSummary {
  return {
    ...receipt,
    orderId: order.id,
    merchantId: order.merchantId,
    status: order.status,
    fulfilment: order.fulfilment,
    version: order.version,
    scheduledFor: iso(order.scheduledFor),
    acceptanceDeadlineAt: iso(order.acceptanceDeadlineAt),
    eta: order.eta && {
      earliestAt: new Date(order.eta.earliestAt).toISOString(),
      latestAt: new Date(order.eta.latestAt).toISOString(),
    },
  };
}

export async function appendOrderEvent(sql: TransactionSql, event: OrderEvent) {
  await sql`
    INSERT INTO public.order_events (
      order_id, version, from_status, to_status, actor_kind, actor_id, payload, occurred_at
    ) VALUES (
      ${event.orderId}, ${event.version}, ${event.from}, ${event.to}, ${event.actor.kind},
      ${event.actor.id}, ${JSON.stringify(event.payload)}::jsonb, ${iso(event.at)}
    )
  `;
  if (event.from === event.to || !customerPushStatus.safeParse(event.to).success) return;
  await enqueueOrderNotification(sql, event);
}

async function enqueueOrderNotification(sql: TransactionSql, event: OrderEvent) {
  const queue = ["order", "notification", event.orderId].join(":");
  await sql`
    WITH channel AS (
      SELECT CASE WHEN EXISTS (
        SELECT FROM public.push_subscriptions AS subscription
        JOIN public.sessions AS session ON session.id = subscription.session_id
        WHERE subscription.user_id = orders.customer_id AND session.revoked_at IS NULL
          AND session.expires_at > statement_timestamp()
          AND (subscription.expires_ms IS NULL OR subscription.expires_ms > extract(epoch FROM statement_timestamp()) * 1000)
      ) THEN 'push' ELSE 'sms' END AS preferred
      FROM public.orders WHERE id = ${event.orderId} AND customer_id IS NOT NULL
        AND (${event.to} <> 'ready' OR fulfilment = 'pickup')
    )
    SELECT graphile_worker.add_job(
      'order.' || preferred, json_build_object('orderId', ${event.orderId}::uuid, 'version', ${event.version}::int),
      queue_name => ${queue}, job_key => 'order:' || preferred || ':' || ${event.orderId} || ':' || ${event.version}::text,
      max_attempts => 8
    ) FROM channel
  `;
}

export type OrderTimer = "expire" | "release";

export async function enqueueOrderTimer(sql: TransactionSql, order: OrderSnapshot) {
  const action = order.status === "scheduled" ? "release" : "expire";
  const runAt = action === "release" ? order.releaseAt : order.acceptanceDeadlineAt;
  if (runAt === null) return;
  await sql`
    SELECT graphile_worker.add_job(
      'order.timer', json_build_object('orderId', ${order.id}::uuid, 'action', ${action}::text),
      run_at => ${iso(runAt)}::timestamptz, job_key => ${["order", action, order.id].join(":")}
    )
  `;
}

export type OrderStateRow = OrderSnapshot & {
  travelMinutes: number;
  deliveryCodeDigest: Uint8Array | null;
  deliveryCodeAttempts: number;
  shortCode: string;
  totalDzd: number;
  placedAt: Date;
};

export function orderStateColumns(sql: TransactionSql) {
  return sql`
    id, customer_id AS "customerId", merchant_id AS "merchantId", fulfilment, status,
      courier_id AS "courierId", version, prep_minutes AS "prepMinutes",
      travel_minutes AS "travelMinutes", short_code AS "shortCode", total_dzd AS "totalDzd",
      placed_at AS "placedAt", delivery_code_digest AS "deliveryCodeDigest",
      delivery_code_attempts AS "deliveryCodeAttempts",
      (extract(epoch FROM last_event_at) * 1000)::float8 AS "lastEventAt",
      (extract(epoch FROM scheduled_for) * 1000)::float8 AS "scheduledFor",
      (extract(epoch FROM release_at) * 1000)::float8 AS "releaseAt",
      (extract(epoch FROM acceptance_deadline_at) * 1000)::float8 AS "acceptanceDeadlineAt",
      CASE WHEN eta_earliest_at IS NOT NULL THEN jsonb_build_object(
        'earliestAt', extract(epoch FROM eta_earliest_at) * 1000,
        'latestAt', extract(epoch FROM eta_latest_at) * 1000
      ) END AS eta
  `;
}

export async function readOrderSnapshot(sql: TransactionSql, orderId: string, lock: boolean) {
  const [snapshot] = await sql<OrderStateRow[]>`
    SELECT ${orderStateColumns(sql)}
    FROM public.orders WHERE id = ${orderId}
    ${lock ? sql`FOR UPDATE` : sql``}
  `.parsers(timestampParsers);
  return snapshot;
}

export async function writeOrderState(
  sql: TransactionSql,
  order: OrderSnapshot,
  deliveryDigest: Buffer | null = null,
) {
  await sql`
    UPDATE public.orders SET status = ${order.status}, version = ${order.version},
      last_event_at = ${iso(order.lastEventAt)}, acceptance_deadline_at = ${iso(order.acceptanceDeadlineAt)},
      prep_minutes = ${order.prepMinutes}, courier_id = ${order.courierId},
      delivery_code_digest = CASE WHEN ${order.status} = 'out_for_delivery'
        THEN coalesce(delivery_code_digest, ${deliveryDigest}::bytea) ELSE NULL END,
      eta_earliest_at = ${iso(order.eta?.earliestAt ?? null)},
      eta_latest_at = ${iso(order.eta?.latestAt ?? null)}
    WHERE id = ${order.id}
  `;
}
