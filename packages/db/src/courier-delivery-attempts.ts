import type { deliveryAttemptInput, deliveryAttemptOutput } from "@zaafran/contracts/courier";
import type { TransactionSql } from "postgres";
import { lockCourierDelivery } from "./courier-delivery-scope.js";
import type { CourierScope } from "./courier-invitations.js";
import { hash } from "./order-placement-store.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Action = ReturnType<typeof deliveryAttemptInput.parse>["action"];
type State = ReturnType<typeof deliveryAttemptOutput.parse>;
export type DeliveryAttemptRequest = CourierScope & {
  orderId: string;
  action: Action;
  idempotencyKey: string;
  now: Date;
};

export async function readDeliveryAttempts(sql: TransactionSql, orderId: string) {
  const [state] = await sql<
    { waitStartedAt: Date | null; callAttempts: number; lastCallAt: Date | null }[]
  >`
    SELECT min(occurred_at) FILTER (WHERE action = 'start_wait') AS "waitStartedAt",
      count(*) FILTER (WHERE action = 'call')::int AS "callAttempts",
      max(occurred_at) FILTER (WHERE action = 'call') AS "lastCallAt"
    FROM public.courier_delivery_attempts WHERE order_id = ${orderId}
  `.parsers(timestampParsers);
  if (!state) throw new Error("Expected delivery attempt state");
  return state;
}

function nextState(
  request: DeliveryAttemptRequest,
  current: Awaited<ReturnType<typeof readDeliveryAttempts>>,
) {
  const { now, action } = request;
  const waitStartedAt = current.waitStartedAt?.toISOString() ?? null;
  const { callAttempts } = current;
  if (action === "start_wait") {
    const state = { waitStartedAt: waitStartedAt ?? now.toISOString(), callAttempts };
    return { kind: waitStartedAt === null ? "new" : "existing", state } as const;
  }
  const lastCallAt = current.lastCallAt?.getTime() ?? -Infinity;
  if (callAttempts >= 20 || now.getTime() - lastCallAt < 20_000)
    return { kind: "rate_limited" } as const;
  return { kind: "new", state: { waitStartedAt, callAttempts: callAttempts + 1 } } as const;
}

export async function recordDeliveryAttempt(sql: TransactionSql, request: DeliveryAttemptRequest) {
  const delivery = await lockCourierDelivery(sql, request);
  if (!delivery) return { kind: "not_found" } as const;
  const { orderId, action, now, idempotencyKey } = request;
  const key = hash(idempotencyKey);
  const [prior] = await sql<{ action: Action; response: State }[]>`
    SELECT action, response FROM public.courier_delivery_attempts
    WHERE order_id = ${orderId} AND courier_id = ${delivery.courierId} AND key_hash = ${key}
  `;
  if (prior)
    return prior.action === action
      ? ({ kind: "recorded", state: prior.response } as const)
      : ({ kind: "idempotency_conflict" } as const);

  const next = nextState(request, await readDeliveryAttempts(sql, orderId));
  if (next.kind === "rate_limited") return next;
  if (next.kind === "new") {
    await sql`
      INSERT INTO public.courier_delivery_attempts (order_id, courier_id, key_hash, action, occurred_at, response)
      VALUES (${orderId}, ${delivery.courierId}, ${key}, ${action}, ${now.toISOString()},
        ${JSON.stringify(next.state)}::jsonb)
    `;
  }
  return { kind: "recorded", state: next.state } as const;
}
