import { estimateDelivery } from "@zaafran/domain/eta";
import { transition } from "@zaafran/domain/order-transition";
import type { OrderAction, OrderActor, OrderSnapshot } from "@zaafran/domain/order-types";
import type { TransactionSql } from "postgres";
import { hash } from "./order-placement-store.js";
import {
  appendOrderEvent,
  orderSummaryFor,
  readOrderSnapshot,
  writeOrderState,
  type OrderSummary,
} from "./order-state-store.js";

type Role =
  | "standard"
  | "customer"
  | "merchant_owner"
  | "merchant_manager"
  | "merchant_staff"
  | "admin"
  | "courier";
export type OrderAccess = { accountId: string; role: Role; orderId: string };
type PublicAction =
  | Extract<OrderAction, { kind: "cancel" | "collect" | "markReady" | "pickUp" | "force" }>
  | { kind: "assignCourier"; courierId: string }
  | { kind: "accept"; prepMinutes: number }
  | {
      kind: "reject";
      reason: Extract<OrderAction, { kind: "reject" }>["reason"];
      soldOutItemIds: readonly string[];
    };
export type OrderCommandRequest = OrderAccess & {
  action: PublicAction;
  expectedVersion: number;
  idempotencyKey: string;
  now: Date;
};
type StateRow = NonNullable<Awaited<ReturnType<typeof readOrderSnapshot>>>;

async function readMerchantActor(
  sql: TransactionSql,
  { accountId, lockRole }: { accountId: string; lockRole: boolean },
  merchantId: string,
): Promise<OrderActor | undefined> {
  const lock = lockRole ? sql`FOR SHARE` : sql``;
  const [member] = await sql`SELECT FROM public.merchant_members
    WHERE user_id = ${accountId} AND merchant_id = ${merchantId} ${lock}`;
  return member ? { kind: "merchant", id: accountId, merchantIds: [merchantId] } : undefined;
}

async function readAdminActor(sql: TransactionSql, accountId: string, lockRole: boolean) {
  const lock = lockRole ? sql`FOR SHARE` : sql``;
  const [admin] = await sql`SELECT FROM public.admins WHERE user_id = ${accountId} ${lock}`;
  return admin ? ({ kind: "admin", id: accountId } as const) : undefined;
}

type AuthorizationScope = OrderAccess & {
  lockRole: boolean;
  preferMerchant: boolean;
  allowCourier?: boolean;
};

async function readAssignedCourier(
  sql: TransactionSql,
  { accountId, lockRole }: AuthorizationScope,
  { courierId, merchantId }: OrderSnapshot,
): Promise<OrderActor | undefined> {
  if (!courierId) return undefined;
  const lock = lockRole ? sql`FOR SHARE` : sql``;
  const [courier] = await sql`
    SELECT FROM public.couriers WHERE id = ${courierId} AND merchant_id = ${merchantId}
      AND user_id = ${accountId} AND active ${lock}
  `;
  return courier ? { kind: "courier", id: accountId, courierId, merchantId } : undefined;
}

async function readStandardActor(
  sql: TransactionSql,
  scope: AuthorizationScope,
  order: OrderSnapshot,
): Promise<OrderActor | undefined> {
  const { accountId, preferMerchant, allowCourier } = scope;
  const owner =
    accountId === order.customerId ? ({ kind: "customer", id: accountId } as const) : undefined;
  if (owner && !preferMerchant) return owner;
  const merchant = await readMerchantActor(sql, scope, order.merchantId);
  if (merchant) return merchant;
  const courier = allowCourier ? await readAssignedCourier(sql, scope, order) : undefined;
  return courier ?? owner;
}

async function authorizeOrder(
  sql: TransactionSql,
  scope: AuthorizationScope,
  order: OrderSnapshot,
): Promise<OrderActor | undefined> {
  const { role, accountId, lockRole, allowCourier } = scope;
  switch (role) {
    case "customer":
      return accountId === order.customerId ? { kind: "customer", id: accountId } : undefined;
    case "admin":
      return readAdminActor(sql, accountId, lockRole);
    case "courier":
      return allowCourier ? readAssignedCourier(sql, scope, order) : undefined;
    case "standard":
      return readStandardActor(sql, scope, order);
    default:
      return readMerchantActor(sql, scope, order.merchantId);
  }
}

function presentOrder(order: OrderSnapshot, row: StateRow) {
  return orderSummaryFor(order, {
    shortCode: row.shortCode,
    placedAt: row.placedAt.toISOString(),
    totalDzd: row.totalDzd,
  });
}

export async function readScopedOrder(sql: TransactionSql, request: OrderAccess) {
  const order = await readOrderSnapshot(sql, request.orderId, false);
  return order &&
    (await authorizeOrder(sql, { ...request, lockRole: false, preferMerchant: false }, order))
    ? presentOrder(order, order)
    : undefined;
}

async function toDomainAction(
  sql: TransactionSql,
  { action: input, now }: OrderCommandRequest,
  order: StateRow,
): Promise<OrderAction | undefined> {
  if (input.kind === "assignCourier") {
    const [courier] = await sql<{ id: string; merchantId: string; isActive: boolean }[]>`
      SELECT id, merchant_id AS "merchantId", active AS "isActive" FROM public.couriers
      WHERE id = ${input.courierId} AND merchant_id = ${order.merchantId} FOR SHARE
    `;
    return { ...input, facts: { courier: courier ?? null } };
  }
  if (input.kind === "reject") {
    return {
      kind: input.kind,
      reason: input.reason,
      facts: { soldOutItemIds: input.soldOutItemIds },
    };
  }
  if (input.kind !== "accept") return input;

  const { prepMinutes } = input;
  const range = estimateDelivery({ prepMinutes, travelMinutes: order.travelMinutes });
  if (!range.ok) return undefined;
  return {
    ...input,
    facts: {
      eta: {
        earliestAt: now.getTime() + range.value.earliestMinutes * 60_000,
        latestAt: now.getTime() + range.value.latestMinutes * 60_000,
      },
    },
  };
}

async function markRejectedItemsSoldOut(
  sql: TransactionSql,
  order: OrderSnapshot,
  ids: readonly string[],
) {
  if (ids.length === 0) return true;
  const [selection] = await sql<{ count: number }[]>`
    SELECT count(DISTINCT line->>'itemId')::int AS count
    FROM public.orders CROSS JOIN LATERAL jsonb_array_elements(lines) AS item(line)
    WHERE orders.id = ${order.id} AND line->>'itemId' = ANY(${ids}::text[])
  `;
  if (selection?.count !== ids.length) return false;
  await sql`SELECT FROM public.merchants WHERE id = ${order.merchantId} FOR NO KEY UPDATE`;
  const changed = await sql`
    UPDATE public.items SET is_available = false, sold_out_until = NULL
    WHERE merchant_id = ${order.merchantId} AND id = ANY(${ids}::uuid[]) AND archived_at IS NULL
      AND (is_available OR sold_out_until IS NOT NULL)
  `;
  if (changed.count > 0)
    await sql`UPDATE public.merchants SET menu_revision = menu_revision + 1 WHERE id = ${order.merchantId}`;
  return true;
}

type CommandContext = { order: StateRow; actor: OrderActor };
async function commitCommand(
  sql: TransactionSql,
  request: OrderCommandRequest,
  { order, actor }: CommandContext,
) {
  const { now, idempotencyKey, expectedVersion } = request;
  const keyHash = hash(idempotencyKey);
  const requestHash = hash(JSON.stringify([expectedVersion, request.action]));
  const [receipt] = await sql<{ matches: boolean; response: OrderSummary }[]>`
    SELECT request_hash = ${requestHash} AS matches, response FROM public.order_action_receipts
    WHERE order_id = ${order.id} AND actor_id = ${request.accountId} AND key_hash = ${keyHash}
  `;
  if (receipt)
    return receipt.matches
      ? ({ kind: "applied", order: receipt.response } as const)
      : ({ kind: "idempotency_conflict" } as const);

  const action = await toDomainAction(sql, request, order);
  if (!action) return { kind: "invalid_order_command" } as const;

  const result = transition({
    order,
    actor,
    now: now.getTime(),
    command: {
      action,
      idempotencyKey,
      expectedVersion,
      requestFingerprint: requestHash.toString("hex"),
    },
  });
  if (!result.ok) return { kind: result.error.code };
  if (result.value.kind !== "applied") throw new Error("New order action unexpectedly replayed");
  if (
    action.kind === "reject" &&
    !(await markRejectedItemsSoldOut(sql, order, action.facts.soldOutItemIds))
  ) {
    return { kind: "invalid_order_command" } as const;
  }

  const { event, order: next } = result.value;
  const response = presentOrder(next, order);
  await writeOrderState(sql, next);
  await appendOrderEvent(sql, event);
  await sql`
    INSERT INTO public.order_action_receipts (order_id, actor_id, key_hash, request_hash, response)
    VALUES (${order.id}, ${request.accountId}, ${keyHash}, ${requestHash}, ${JSON.stringify(response)}::jsonb)
  `;
  return { kind: "applied", order: response } as const;
}

export async function applyOrderCommand(sql: TransactionSql, request: OrderCommandRequest) {
  const [account] = await sql`
    SELECT FROM public.users WHERE id = ${request.accountId} AND deleted_at IS NULL AND blocked_at IS NULL FOR SHARE
  `;
  if (!account) return { kind: "not_found" } as const;
  const order = await readOrderSnapshot(sql, request.orderId, true);
  if (!order) return { kind: "not_found" } as const;
  const preferMerchant =
    request.action.kind !== "cancel" || order.status === "accepted" || order.status === "ready";
  const actor = await authorizeOrder(
    sql,
    {
      ...request,
      lockRole: true,
      preferMerchant,
      allowCourier: request.action.kind === "pickUp",
    },
    order,
  );
  return actor ? commitCommand(sql, request, { order, actor }) : ({ kind: "not_found" } as const);
}
