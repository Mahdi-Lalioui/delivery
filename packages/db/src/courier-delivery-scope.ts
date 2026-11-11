import type { TransactionSql } from "postgres";
import type { CourierScope } from "./courier-invitations.js";
import { activeStandardSession } from "./standard-session.js";
import { timestampParsers } from "./timestamp-parsers.js";

export async function lockCourierDelivery(
  sql: TransactionSql,
  request: CourierScope & { orderId: string },
) {
  const [order] = await sql<{ courierId: string; startedAt: Date }[]>`
    SELECT driver.id AS "courierId", delivery.last_event_at AS "startedAt"
    FROM public.orders AS delivery
    JOIN public.couriers AS driver ON driver.id = delivery.courier_id
      AND driver.merchant_id = delivery.merchant_id AND driver.active
    WHERE delivery.id = ${request.orderId} AND delivery.status = 'out_for_delivery'
      AND delivery.address_snapshot IS NOT NULL
      AND driver.user_id = ${request.userId} AND ${activeStandardSession(sql, request)}
    FOR UPDATE OF delivery
  `.parsers(timestampParsers);
  return order;
}
