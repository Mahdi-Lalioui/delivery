import { customerSmsStatus } from "@zaafran/contracts/orders";
import type { DatabaseConnection } from "@zaafran/db/database";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import { runJobEffectOnce } from "./effects.js";
import { orderNotificationCopy, type OrderLocale } from "./order-notification-copy.js";
import { defineJob } from "./jobs.js";
import type { SendOrderSms } from "./order-sms-adapter.js";

export const orderSmsTask = "order.sms";
const payload = z.strictObject({ orderId: z.uuid(), version: z.int().positive() });
type Payload = z.output<typeof payload>;
type Status = z.output<typeof customerSmsStatus>;
type Delivery = { recipient: string; code: string; locale: OrderLocale; status: Status };

async function readDelivery(sql: TransactionSql, { orderId, version }: Payload) {
  const [delivery] = await sql<Delivery[]>`
    SELECT customer.phone_e164 AS recipient, orders.short_code AS code,
      orders.customer_locale AS locale, event.to_status AS status
    FROM public.order_events AS event
    JOIN public.orders AS orders ON orders.id = event.order_id
    JOIN public.users AS customer ON customer.id = orders.customer_id
    WHERE event.order_id = ${orderId} AND event.version = ${version}
      AND event.to_status = ANY(${customerSmsStatus.options}::public.order_status[])
      AND event.from_status IS DISTINCT FROM event.to_status
      AND customer.deleted_at IS NULL AND customer.blocked_at IS NULL
      AND customer.phone_e164 IS NOT NULL
    FOR SHARE OF customer
  `;
  return delivery;
}

export function createOrderSmsJob(database: DatabaseConnection, send: SendOrderSms) {
  return defineJob(payload, async (event) => {
    const key = ["order", "sms", event.orderId, String(event.version)].join(":");
    await runJobEffectOnce({
      database,
      taskIdentifier: orderSmsTask,
      effectKey: key,
      apply: async (transaction) => {
        const delivery = await readDelivery(transaction, event);
        if (delivery) {
          const { recipient, code, locale, status } = delivery;
          await send({
            recipient,
            key,
            text: ["AWID", orderNotificationCopy[locale][status], code].join(" · "),
          });
        }
      },
    });
  });
}
