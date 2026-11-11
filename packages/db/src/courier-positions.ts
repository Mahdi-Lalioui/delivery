import type { courierPositionsInput } from "@zaafran/contracts/courier";
import type { TransactionSql } from "postgres";
import type { CourierScope } from "./courier-invitations.js";
import { acceptedCourierPositions, type Position } from "./courier-position-validation.js";
import { activeCourierSession } from "./courier-session.js";
import { timestampParsers } from "./timestamp-parsers.js";

export type CourierPositionRequest = CourierScope &
  ReturnType<typeof courierPositionsInput.parse> & { now: Date };

async function lockActiveDelivery(sql: TransactionSql, request: CourierPositionRequest) {
  const [order] = await sql<{ courierId: string; startedAt: Date }[]>`
    SELECT driver.id AS "courierId", delivery.last_event_at AS "startedAt"
    FROM public.orders AS delivery
    JOIN public.couriers AS driver ON driver.id = delivery.courier_id
      AND driver.merchant_id = delivery.merchant_id AND driver.active
    WHERE delivery.id = ${request.orderId} AND delivery.status = 'out_for_delivery'
      AND delivery.address_snapshot IS NOT NULL
      AND driver.user_id = ${request.userId} AND ${activeCourierSession(sql, request)}
    FOR UPDATE OF delivery
  `.parsers(timestampParsers);
  return order;
}

async function checkRateLimit(sql: TransactionSql, courierId: string, now: Date) {
  const timestamp = now.toISOString();
  const changed = await sql`
    UPDATE public.couriers SET last_position_request_at = ${timestamp}
    WHERE id = ${courierId} AND active AND (
      last_position_request_at IS NULL
      OR last_position_request_at <= ${timestamp}::timestamptz - interval '3 seconds'
    )
  `;
  return changed.count === 1;
}

async function readLatest(sql: TransactionSql, orderId: string): Promise<Position | undefined> {
  const [last] = await sql<(Omit<Position, "capturedAt" | "heading"> & { capturedAt: Date })[]>`
    SELECT ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
      accuracy_m AS "accuracyM", captured_at AS "capturedAt"
    FROM public.courier_positions WHERE order_id = ${orderId} ORDER BY captured_at DESC LIMIT 1
  `.parsers(timestampParsers);
  return last && { ...last, capturedAt: last.capturedAt.toISOString() };
}

export async function recordCourierPositions(sql: TransactionSql, request: CourierPositionRequest) {
  const order = await lockActiveDelivery(sql, request);
  if (!order) return { kind: "not_found" } as const;
  if (!(await checkRateLimit(sql, order.courierId, request.now)))
    return { kind: "rate_limited" } as const;

  const last = await readLatest(sql, request.orderId);
  const accepted = acceptedCourierPositions(request.positions, last, {
    startedAt: order.startedAt.getTime(),
    now: request.now.getTime(),
  });
  if (accepted.length) {
    await sql`
      INSERT INTO public.courier_positions (order_id, courier_id, location, accuracy_m, heading, captured_at)
      SELECT ${request.orderId}, ${order.courierId},
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
        "accuracyM", heading, "capturedAt"
      FROM jsonb_to_recordset(${JSON.stringify(accepted)}::jsonb)
      AS point(latitude float8, longitude float8, "accuracyM" float8, heading float8, "capturedAt" timestamptz)
    `;
    await sql`SELECT pg_notify('courier_position_events', ${request.orderId.toLowerCase()})`;
  }
  return { kind: "recorded", accepted: accepted.length } as const;
}
