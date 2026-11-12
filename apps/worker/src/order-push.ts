import { createHash } from "node:crypto";
import type { DatabaseConnection } from "@zaafran/db/database";
import { z } from "zod";
import { runJobEffectOnce } from "./effects.js";
import { defineJob } from "./jobs.js";
import { orderNotificationCopy } from "./order-notification-copy.js";
import type { SendOrderPush } from "./order-push-adapter.js";
import { listPushRecipients, readPushDelivery, type PushEvent } from "./order-push-delivery.js";

export const orderPushTask = "order.push";
const payload = z.strictObject({ orderId: z.uuid(), version: z.int().positive() });

export function createOrderPushJob(database: DatabaseConnection, send: SendOrderPush) {
  return defineJob(payload, async ({ orderId, version }: PushEvent) => {
    const recipients = await listPushRecipients(database.sql, orderId);
    const id = [orderId, String(version)].join(":");

    await Promise.all(
      recipients.map(async (recipient) => {
        const endpointHash = createHash("sha256").update(recipient.endpoint).digest("hex");
        await runJobEffectOnce({
          database,
          taskIdentifier: orderPushTask,
          effectKey: [id, endpointHash].join(":"),
          apply: async (transaction) => {
            const delivery = await readPushDelivery(transaction, { orderId, version }, recipient);
            if (!delivery) return;
            const { endpoint, sessionId, keys, locale, status, code } = delivery;
            const result = await send(
              { endpoint, keys },
              {
                id,
                status,
                code,
                title: "AWID",
                body: orderNotificationCopy[locale][status],
                url: `/${locale}/orders`,
              },
            );
            if (result === "gone") {
              await transaction`DELETE FROM public.push_subscriptions WHERE endpoint = ${endpoint} AND session_id = ${sessionId}`;
            }
          },
        });
      }),
    );
  });
}
