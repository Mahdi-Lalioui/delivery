import { customerPushStatus } from "@zaafran/contracts/push";
import type { DatabaseConnection } from "@zaafran/db/database";
import type { createResendSender } from "@zaafran/notifications";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import { runJobEffectOnce } from "./effects.js";
import { defineJob } from "./jobs.js";
import { orderNotificationCopy, type OrderLocale } from "./order-notification-copy.js";
import type { SendOrderPush } from "./order-push-adapter.js";
import { listPushRecipients, readPushDelivery, type PushEvent } from "./order-push-delivery.js";
import type { SendOrderSms } from "./order-sms-adapter.js";

export const orderPushTask = "order.push";
export const orderSmsTask = "order.sms";
const notificationEffect = "order.notification";
const payload = z.strictObject({ orderId: z.uuid(), version: z.int().positive() });
type Status = z.output<typeof customerPushStatus>;
type Delivery = {
  phone: string | null;
  email: string | null;
  code: string;
  locale: OrderLocale;
  status: Status;
};
export type SendOrderEmail = ReturnType<typeof createResendSender>;
export type NotificationSenders = {
  orderPush?: SendOrderPush | undefined;
  orderSms?: SendOrderSms | undefined;
  orderEmail?: SendOrderEmail | undefined;
};

async function readDelivery(sql: TransactionSql, { orderId, version }: PushEvent) {
  const [delivery] = await sql<Delivery[]>`
    SELECT customer.phone_e164 AS phone, customer.email, orders.short_code AS code,
      orders.customer_locale AS locale, event.to_status AS status
    FROM public.order_events AS event
    JOIN public.orders AS orders ON orders.id = event.order_id AND orders.status = event.to_status
    JOIN public.users AS customer ON customer.id = orders.customer_id
    WHERE event.order_id = ${orderId} AND event.version = ${version}
      AND event.to_status = ANY(${customerPushStatus.options}::public.order_status[])
      AND event.from_status IS DISTINCT FROM event.to_status
      AND (event.to_status <> 'ready' OR orders.fulfilment = 'pickup')
      AND customer.deleted_at IS NULL AND customer.blocked_at IS NULL
    FOR SHARE OF customer
  `;
  return delivery;
}

async function tryPush(
  sql: TransactionSql,
  event: PushEvent & { id: string },
  send: SendOrderPush | undefined,
) {
  if (!send) return { delivered: false, failed: false };
  const recipients = await listPushRecipients(sql, event.orderId);
  const attempts = await Promise.all(
    recipients.map(async (recipient) => {
      const delivery = await readPushDelivery(sql, event, recipient);
      if (!delivery) return "skipped" as const;
      const [legacy] = await sql`
        SELECT FROM public.job_effects WHERE task_identifier = ${orderPushTask}
          AND effect_key = ${event.id} || ':' || encode(sha256(convert_to(${delivery.endpoint}, 'UTF8')), 'hex')
      `;
      if (legacy) return "sent" as const;
      const { endpoint, sessionId, keys, locale, status, code } = delivery;
      const result = await send(
        { endpoint, keys },
        {
          id: event.id,
          status,
          code,
          title: "AWID",
          body: orderNotificationCopy[locale][status],
          url: `/${locale}/orders`,
        },
      ).catch(() => "failed" as const);
      if (result === "gone")
        await sql`DELETE FROM public.push_subscriptions WHERE endpoint = ${endpoint} AND session_id = ${sessionId}`;
      return result;
    }),
  );
  return { delivered: attempts.includes("sent"), failed: attempts.includes("failed") };
}

async function sendFallback(
  { orderSms, orderEmail }: NotificationSenders,
  id: string,
  delivery: Delivery,
) {
  const { phone, email, locale, status, code } = delivery;
  const subject = `AWID · ${orderNotificationCopy[locale][status]}`;
  const text = `${subject} · ${code}`;
  if (phone !== null && orderSms) {
    await orderSms({ recipient: phone, text, key: `order:sms:${id}` });
    return true;
  }
  if (phone === null && email !== null && orderEmail) {
    const html = `<p lang="${locale}" dir="auto">${subject} · <bdi>${code}</bdi></p>`;
    await orderEmail({ to: email, subject, text, html, key: `order:email:${id}` });
    return true;
  }
  return false;
}

export function createOrderNotificationJob(
  database: DatabaseConnection,
  senders: NotificationSenders,
) {
  return defineJob(payload, async (event) => {
    const id = `${event.orderId}:${event.version.toString()}`;
    await runJobEffectOnce({
      database,
      taskIdentifier: notificationEffect,
      effectKey: id,
      apply: async (sql) => {
        const [legacy] =
          await sql`SELECT FROM public.job_effects WHERE task_identifier = ${orderSmsTask} AND effect_key = ${`order:sms:${id}`}`;
        if (legacy) return;
        const delivery = await readDelivery(sql, event);
        if (!delivery) return;
        const push = await tryPush(sql, { ...event, id }, senders.orderPush);
        if (push.delivered) return;
        const fallback = await sendFallback(senders, id, delivery);
        if (!fallback && push.failed) throw new Error("No order notification was delivered");
      },
    });
  });
}
