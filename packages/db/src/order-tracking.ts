import type { customerTrackingOutput, trackingPositionEvent } from "@zaafran/contracts/tracking";
import type { TransactionSql } from "postgres";
import { revealDeliveryCode } from "./order-delivery-code.js";
import { orderStateColumns, orderSummaryFor, type OrderStateRow } from "./order-state-store.js";
import { activeStandardSession } from "./standard-session.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Tracking = ReturnType<typeof customerTrackingOutput.parse>;
type Delivery = Extract<Tracking, { fulfilment: "delivery" }>;
type Timeline = Tracking["timeline"];
type Position = ReturnType<typeof trackingPositionEvent.parse>;
export type CustomerTrackingScope = { orderId: string; customerId: string; sessionId: string };

type TrackingRow = OrderStateRow & {
  restaurant: { phone: Tracking["restaurantPhone"]; pin: Delivery["destination"] };
  destination: Delivery["destination"] | null;
};

export async function readCustomerPosition(
  sql: TransactionSql,
  { orderId, customerId }: Pick<CustomerTrackingScope, "orderId" | "customerId">,
): Promise<Position | undefined> {
  const [row] = await sql<
    (Omit<Position, "capturedAt" | "heading"> & { capturedAt: Date; heading: number | null })[]
  >`
    SELECT position.order_id AS "orderId", ST_Y(position.location::geometry) AS latitude,
      ST_X(position.location::geometry) AS longitude, position.heading, position.captured_at AS "capturedAt"
    FROM public.courier_positions AS position
    JOIN public.orders AS delivery ON delivery.id = position.order_id AND delivery.courier_id = position.courier_id
    JOIN public.couriers AS driver ON driver.id = position.courier_id AND driver.active
    JOIN public.users AS account ON account.id = driver.user_id
      AND account.blocked_at IS NULL AND account.deleted_at IS NULL
    WHERE delivery.id = ${orderId} AND delivery.customer_id = ${customerId}
      AND delivery.status = 'out_for_delivery'
    ORDER BY position.captured_at DESC LIMIT 1
  `.parsers(timestampParsers);
  if (!row) return undefined;
  const { heading, capturedAt, ...point } = row;
  return {
    ...point,
    capturedAt: capturedAt.toISOString(),
    ...(heading === null ? {} : { heading }),
  };
}

async function readCourier(sql: TransactionSql, order: TrackingRow): Promise<Delivery["courier"]> {
  if (order.status !== "out_for_delivery" || !order.courierId || !order.customerId) return null;
  const [driver] = await sql<
    {
      firstName: string | null;
      phone: Delivery["restaurantPhone"];
    }[]
  >`
    SELECT nullif(split_part(courier.display_name, ' ', 1), '') AS "firstName", account.phone_e164 AS phone
    FROM public.couriers AS courier
    JOIN public.users AS account ON account.id = courier.user_id AND account.deleted_at IS NULL AND account.blocked_at IS NULL
    WHERE courier.id = ${order.courierId} AND courier.merchant_id = ${order.merchantId} AND courier.active
  `;
  if (!driver) return null;
  const latest = await readCustomerPosition(sql, {
    orderId: order.id,
    customerId: order.customerId,
  });
  if (!latest) return { ...driver, position: null };
  const { latitude, longitude, capturedAt, heading } = latest;
  return {
    ...driver,
    position: { latitude, longitude, capturedAt, ...(heading === undefined ? {} : { heading }) },
  };
}

async function readTimeline(sql: TransactionSql, orderId: string): Promise<Timeline> {
  const events = await sql<{ status: Timeline[number]["status"]; at: Date }[]>`
    SELECT to_status AS status, occurred_at AS at FROM public.order_events
    WHERE order_id = ${orderId} AND from_status IS DISTINCT FROM to_status
    ORDER BY version
  `.parsers(timestampParsers);
  return events.map(({ status, at }) => ({ status, at: at.toISOString() }));
}

export async function readCustomerTracking(
  sql: TransactionSql,
  { orderId, customerId, sessionId }: CustomerTrackingScope,
  deliveryKey?: Uint8Array,
): Promise<Tracking | undefined> {
  const [row] = await sql<TrackingRow[]>`
    SELECT ${orderStateColumns(sql)}, address_snapshot->'pin' AS destination,
      (SELECT jsonb_build_object('phone', merchant.phone_e164, 'pin', jsonb_build_object(
        'latitude', ST_Y(merchant.location::geometry), 'longitude', ST_X(merchant.location::geometry)))
       FROM public.merchants AS merchant WHERE merchant.id = orders.merchant_id) AS restaurant
    FROM public.orders WHERE id = ${orderId} AND customer_id = ${customerId}
      AND ${activeStandardSession(sql, { userId: customerId, sessionId })}
  `.parsers(timestampParsers);
  if (!row) return undefined;
  const { shortCode, totalDzd, placedAt, restaurant, fulfilment, destination } = row;
  const base = {
    order: orderSummaryFor(row, { shortCode, totalDzd, placedAt: placedAt.toISOString() }),
    timeline: await readTimeline(sql, row.id),
    restaurantPhone: restaurant.phone,
    shareToken: null,
  };
  if (fulfilment === "pickup")
    return { ...base, fulfilment, pickupPin: restaurant.pin, pickupCode: shortCode };
  if (!destination) return undefined;
  const deliveryCode =
    deliveryKey && row.status === "out_for_delivery" && row.deliveryCodeAttempts < 5
      ? revealDeliveryCode(deliveryKey, orderId, row.deliveryCodeDigest)
      : null;
  return {
    ...base,
    fulfilment,
    destination,
    courier: await readCourier(sql, row),
    deliveryCode,
    route: null,
  };
}
