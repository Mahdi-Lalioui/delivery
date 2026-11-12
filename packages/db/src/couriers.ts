import type { courierJobsOutput, courierRosterOutput } from "@zaafran/contracts/courier";
import type { ISql, TransactionSql } from "postgres";
import {
  acceptCourierInvitation,
  inviteCourier,
  type AcceptRequest,
  type CourierScope,
  type InviteRequest,
} from "./courier-invitations.js";
import { recordDeliveryAttempt, type DeliveryAttemptRequest } from "./courier-delivery-attempts.js";
import { recordCourierPositions, type CourierPositionRequest } from "./courier-positions.js";
import { activeStandardSession } from "./standard-session.js";
import type { DatabaseConnection } from "./database.js";

import { orderStateColumns, orderSummaryFor, type OrderStateRow } from "./order-state-store.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Jobs = ReturnType<typeof courierJobsOutput.parse>;
type Driver = Omit<Jobs, "jobs">;
type Job = Jobs["jobs"][number];
type JobRow = OrderStateRow &
  Pick<Job, "pickup" | "dropoff" | "customerPhone" | "changeDzd" | "deliveryAttempt">;
type Roster = ReturnType<typeof courierRosterOutput.parse>["couriers"];
type RosterRequest = CourierScope & { merchantId: string };
type PresenceRequest = CourierScope & { online: boolean };

async function listCouriers(
  sql: TransactionSql,
  request: RosterRequest,
): Promise<Roster | undefined> {
  const [member] = await sql`
    SELECT FROM public.merchant_members WHERE user_id = ${request.userId} AND merchant_id = ${request.merchantId}
      AND ${activeStandardSession(sql, request)}
  `;
  if (!member) return undefined;
  return sql<Roster>`
    SELECT id AS "courierId", display_name AS "displayName", online
    FROM public.couriers WHERE merchant_id = ${request.merchantId} AND active ORDER BY id
  `;
}

async function setCourierPresence(sql: ISql, request: PresenceRequest) {
  const changed = await sql`
    UPDATE public.couriers SET online = ${request.online}
    WHERE user_id = ${request.userId} AND active AND ${activeStandardSession(sql, request)}
  `;
  return changed.count > 0;
}

async function readCourierJobs(
  sql: TransactionSql,
  request: CourierScope,
): Promise<Jobs | undefined> {
  const [driver] = await sql<Driver[]>`
    SELECT id AS "courierId", merchant_id AS "merchantId", online
    FROM public.couriers WHERE user_id = ${request.userId} AND active AND ${activeStandardSession(sql, request)}
  `;
  if (!driver) return undefined;
  const rows = await sql<JobRow[]>`
    SELECT ${orderStateColumns(sql)},
      (SELECT jsonb_build_object('restaurantName', orders.restaurant_name, 'pin', jsonb_build_object(
        'latitude', ST_Y(merchant.location::geometry), 'longitude', ST_X(merchant.location::geometry)))
       FROM public.merchants AS merchant WHERE merchant.id = orders.merchant_id) AS pickup,
      address_snapshot - ARRAY['addressId', 'label', 'isDefault'] AS dropoff,
      (SELECT coalesce(orders.contact_phone_e164, phone_e164) FROM public.users WHERE id = orders.customer_id
        AND deleted_at IS NULL AND blocked_at IS NULL) AS "customerPhone",
      (SELECT jsonb_build_object(
        'waitStartedAt', to_char(min(occurred_at) FILTER (WHERE action = 'start_wait') AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'callAttempts', count(*) FILTER (WHERE action = 'call')::int
      ) FROM public.courier_delivery_attempts WHERE order_id = orders.id) AS "deliveryAttempt",
      paying_with_dzd - total_dzd AS "changeDzd"
    FROM public.orders WHERE courier_id = ${driver.courierId} AND merchant_id = ${driver.merchantId}
      AND fulfilment = 'delivery' AND address_snapshot IS NOT NULL
      AND status IN ('accepted', 'ready', 'out_for_delivery')
    ORDER BY placed_at, id
  `.parsers(timestampParsers);
  const jobs = rows.map((row) => ({
    order: orderSummaryFor(row, {
      shortCode: row.shortCode,
      totalDzd: row.totalDzd,
      placedAt: row.placedAt.toISOString(),
    }),
    pickup: row.pickup,
    dropoff: row.dropoff,
    customerFirstName: null,
    customerPhone: row.customerPhone,
    deliveryAttempt: row.deliveryAttempt,
    changeDzd: row.changeDzd,
  }));
  return { ...driver, jobs };
}

export function createCourierRepository({ sql }: DatabaseConnection) {
  return {
    invite: (request: InviteRequest) => sql.begin((tx) => inviteCourier(tx, request)),
    accept: (request: AcceptRequest) => sql.begin((tx) => acceptCourierInvitation(tx, request)),
    list: (request: RosterRequest) =>
      sql.begin("isolation level repeatable read read only", (tx) => listCouriers(tx, request)),
    jobs: (request: CourierScope) =>
      sql.begin("isolation level repeatable read read only", (tx) => readCourierJobs(tx, request)),
    recordDeliveryAttempt: (request: DeliveryAttemptRequest) =>
      sql.begin((tx) => recordDeliveryAttempt(tx, request)),
    recordPositions: (request: CourierPositionRequest) =>
      sql.begin((tx) => recordCourierPositions(tx, request)),
    setPresence: (request: PresenceRequest) => setCourierPresence(sql, request),
  };
}
