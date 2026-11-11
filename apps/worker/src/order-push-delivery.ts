import { customerPushStatus } from "@zaafran/contracts/push";
import type { ISql, TransactionSql } from "postgres";
import type { OrderLocale } from "./order-notification-copy.js";

export type PushEvent = { orderId: string; version: number };
type Recipient = { endpoint: string; sessionId: string };
type Delivery = Recipient & {
  keys: { p256dh: string; auth: string };
  code: string;
  locale: OrderLocale;
  status: ReturnType<typeof customerPushStatus.parse>;
};

function activeDevices(sql: ISql) {
  return sql`
    FROM public.orders AS orders
    JOIN public.push_subscriptions AS subscription ON subscription.user_id = orders.customer_id
    JOIN public.sessions AS session ON session.id = subscription.session_id
      AND session.user_id = subscription.user_id AND session.revoked_at IS NULL
      AND session.expires_at > statement_timestamp()
    JOIN public.users AS customer ON customer.id = subscription.user_id
      AND customer.deleted_at IS NULL AND customer.blocked_at IS NULL
    WHERE orders.id = `;
}

function expiration(sql: ISql) {
  return sql`
    AND (subscription.expires_ms IS NULL OR subscription.expires_ms > extract(epoch FROM statement_timestamp()) * 1000)
  `;
}

export async function listPushRecipients(sql: ISql, orderId: string) {
  return sql<Recipient[]>`
    SELECT subscription.endpoint, subscription.session_id AS "sessionId"
    ${activeDevices(sql)} ${orderId} ${expiration(sql)}
  `;
}

export async function readPushDelivery(
  sql: TransactionSql,
  event: PushEvent,
  recipient: Recipient,
) {
  const [delivery] = await sql<Delivery[]>`
    SELECT subscription.endpoint, subscription.session_id AS "sessionId",
      jsonb_build_object('p256dh', subscription.p256dh, 'auth', subscription.auth_key) AS keys,
      orders.short_code AS code, orders.customer_locale AS locale, orders.status AS status
    ${activeDevices(sql)} ${event.orderId} ${expiration(sql)}
      AND subscription.endpoint = ${recipient.endpoint} AND subscription.session_id = ${recipient.sessionId}
      AND EXISTS (
        SELECT FROM public.order_events AS event
        WHERE event.order_id = orders.id AND event.version = ${event.version}
          AND event.from_status IS DISTINCT FROM event.to_status AND event.to_status = orders.status
          AND event.to_status = ANY(${customerPushStatus.options}::public.order_status[])
          AND (event.to_status <> 'ready' OR orders.fulfilment = 'pickup')
      )
    FOR SHARE OF customer
  `;
  return delivery;
}

export async function pruneInactivePushSubscriptions(sql: ISql) {
  await sql`
    DELETE FROM public.push_subscriptions WHERE endpoint IN (
      SELECT subscription.endpoint FROM public.push_subscriptions AS subscription
      JOIN public.sessions AS session ON session.id = subscription.session_id
      WHERE session.revoked_at IS NOT NULL OR session.expires_at <= statement_timestamp()
        OR subscription.expires_ms <= extract(epoch FROM statement_timestamp()) * 1000
      LIMIT 5000 FOR UPDATE OF subscription SKIP LOCKED
    )
  `;
}
