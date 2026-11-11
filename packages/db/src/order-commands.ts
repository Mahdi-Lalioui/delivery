import { estimateDelivery } from "@zaafran/domain/eta";
import { transition } from "@zaafran/domain/order-transition";
import type { OrderAction, OrderActor, OrderSnapshot } from "@zaafran/domain/order-types";
import type { TransactionSql } from "postgres";
import { readDeliveryAttempts } from "./courier-delivery-attempts.js";
import {
  deliveryCodeDigest,
  deriveDeliveryCode,
  matchesDeliveryCode,
} from "./order-delivery-code.js";
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
  | { kind: "deliver"; code: string }
  | { kind: "deliverPhoto"; photoId: string; reason: string }
  | { kind: "fail"; reason: string }
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

async function resolvePhotoProof(
  sql: TransactionSql,
  input: { photoId: string; reason: string; accountId: string },
  order: StateRow,
): Promise<OrderAction | undefined> {
  if (order.customerId === null) return undefined;
  const [photo] = await sql`
      SELECT FROM public.media_uploads WHERE id = ${input.photoId} AND owner_id = ${input.accountId}
        AND merchant_id = ${order.merchantId} AND delivery_order_id = ${order.id}
        AND kind = 'delivery_proof' AND status = 'ready' AND NOT delivery_proof_purging
      FOR SHARE
    `;
  return {
    kind: "deliver",
    facts: {
      proof: {
        kind: "photo",
        photoId: input.photoId,
        reason: input.reason,
        isPhotoVerified: photo !== undefined,
      },
    },
  };
}

async function toDomainAction(
  sql: TransactionSql,
  {
    action: input,
    now,
    accountId,
  }: Omit<OrderCommandRequest, "action"> & { action: Exclude<PublicAction, { kind: "deliver" }> },
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
  if (input.kind === "deliverPhoto") return resolvePhotoProof(sql, { ...input, accountId }, order);
  if (input.kind === "fail") {
    const { waitStartedAt, callAttempts } = await readDeliveryAttempts(sql, order.id);
    return { ...input, facts: { waitStartedAt: waitStartedAt?.getTime() ?? null, callAttempts } };
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

type CommandContext = { order: StateRow; actor: OrderActor; deliveryKey: Uint8Array | undefined };
type FailedProof = { kind: "invalid_delivery_code" | "delivery_code_locked" };
type ReceiptResponse = OrderSummary | FailedProof;
type ReceiptKey = { orderId: string; accountId: string; keyHash: Buffer; requestHash: Buffer };

async function readActionReceipt(sql: TransactionSql, key: ReceiptKey) {
  const [receipt] = await sql<{ matches: boolean; response: ReceiptResponse }[]>`
    SELECT request_hash = ${key.requestHash} AS matches, response FROM public.order_action_receipts
    WHERE order_id = ${key.orderId} AND actor_id = ${key.accountId} AND key_hash = ${key.keyHash}
  `;
  if (!receipt) return undefined;
  if (!receipt.matches) return { kind: "idempotency_conflict" } as const;
  return "kind" in receipt.response
    ? receipt.response
    : ({ kind: "applied", order: receipt.response } as const);
}

async function saveActionReceipt(sql: TransactionSql, key: ReceiptKey, response: ReceiptResponse) {
  await sql`
    INSERT INTO public.order_action_receipts (order_id, actor_id, key_hash, request_hash, response)
    VALUES (${key.orderId}, ${key.accountId}, ${key.keyHash}, ${key.requestHash}, ${JSON.stringify(response)}::jsonb)
  `;
}

type DeliveryAttempt = {
  digest: Buffer;
  expected: Buffer | Uint8Array;
  action: Extract<OrderAction, { kind: "deliver" }>;
};

function deliveryAttempt(key: Uint8Array, order: StateRow, suppliedCode: string): DeliveryAttempt {
  const digest = deliveryCodeDigest(key, order.id, suppliedCode);
  const expected =
    order.deliveryCodeDigest ??
    deliveryCodeDigest(key, order.id, deriveDeliveryCode(key, order.id));
  return {
    digest,
    expected,
    action: {
      kind: "deliver",
      facts: {
        proof: {
          kind: "code",
          isCodeValid: matchesDeliveryCode(expected, digest),
          failedAttempts: order.deliveryCodeAttempts,
        },
      },
    },
  };
}

async function recordWrongDeliveryCode(
  sql: TransactionSql,
  attempt: DeliveryAttempt,
  { order, key }: { order: StateRow; key: ReceiptKey },
): Promise<FailedProof> {
  if (order.deliveryCodeAttempts >= 5) return { kind: "delivery_code_locked" };
  const count = order.deliveryCodeAttempts + 1;
  const result = { kind: count === 5 ? "delivery_code_locked" : "invalid_delivery_code" } as const;
  await sql`
    UPDATE public.orders SET delivery_code_attempts = ${count}, delivery_code_digest = ${Buffer.from(attempt.expected)}
    WHERE id = ${order.id}
  `;
  await saveActionReceipt(sql, key, result);
  return result;
}

async function persistTransition(
  sql: TransactionSql,
  result: Extract<ReturnType<typeof transition>, { ok: true }>["value"],
  { key, context }: { key: ReceiptKey; context: CommandContext },
) {
  if (result.kind !== "applied") throw new Error("New order action unexpectedly replayed");
  const { event, order: next } = result;
  const { order, deliveryKey } = context;
  const digest =
    event.payload.kind === "pickUp" && deliveryKey
      ? deliveryCodeDigest(deliveryKey, order.id, deriveDeliveryCode(deliveryKey, order.id))
      : null;
  const response = presentOrder(next, order);
  await writeOrderState(sql, next, digest);
  if (event.payload.kind === "deliver" && event.payload.proof.kind === "photo") {
    const { photoId, reason } = event.payload.proof;
    await sql`
      INSERT INTO public.order_delivery_photo_proofs (order_id, photo_id, merchant_id, reason, submitted_at)
      VALUES (${order.id}, ${photoId}, ${order.merchantId}, ${reason}, ${new Date(event.at).toISOString()})
    `;
  }
  await appendOrderEvent(sql, event);
  await saveActionReceipt(sql, key, response);
  return { kind: "applied", order: response } as const;
}

function actionReceiptKey(
  request: OrderCommandRequest,
  orderId: string,
  fingerprint: unknown,
): ReceiptKey {
  return {
    orderId,
    accountId: request.accountId,
    keyHash: hash(request.idempotencyKey),
    requestHash: hash(JSON.stringify([request.expectedVersion, fingerprint])),
  };
}

function transitionCommand(
  context: CommandContext,
  { request, action, key }: { request: OrderCommandRequest; action: OrderAction; key: ReceiptKey },
) {
  return transition({
    order: context.order,
    actor: context.actor,
    now: request.now.getTime(),
    command: {
      action,
      idempotencyKey: request.idempotencyKey,
      expectedVersion: request.expectedVersion,
      requestFingerprint: key.requestHash.toString("hex"),
    },
  });
}

async function commitDeliveryCode(
  sql: TransactionSql,
  request: OrderCommandRequest & { action: { kind: "deliver"; code: string } },
  context: CommandContext,
) {
  const { order, deliveryKey } = context;
  if (!deliveryKey) return { kind: "delivery_code_unavailable" } as const;
  const attempt = deliveryAttempt(deliveryKey, order, request.action.code);
  const key = actionReceiptKey(request, order.id, ["deliver", attempt.digest.toString("hex")]);
  const receipt = await readActionReceipt(sql, key);
  if (receipt) return receipt;

  const result = transitionCommand(context, { request, key, action: attempt.action });
  if (result.ok) return persistTransition(sql, result.value, { key, context });
  if (result.error.code === "invalid_order_command" && order.status === "out_for_delivery")
    return recordWrongDeliveryCode(sql, attempt, { order, key });
  return { kind: result.error.code };
}

async function commitCommand(
  sql: TransactionSql,
  request: OrderCommandRequest,
  context: CommandContext,
) {
  const { action: input } = request;
  if (input.kind === "deliver")
    return commitDeliveryCode(sql, { ...request, action: input }, context);
  const { order } = context;
  const key = actionReceiptKey(request, order.id, input);
  const receipt = await readActionReceipt(sql, key);
  if (receipt) return receipt;
  const action = await toDomainAction(sql, { ...request, action: input }, order);
  if (!action) return { kind: "invalid_order_command" } as const;
  const result = transitionCommand(context, { request, key, action });
  if (!result.ok) return { kind: result.error.code };
  if (
    action.kind === "reject" &&
    !(await markRejectedItemsSoldOut(sql, order, action.facts.soldOutItemIds))
  ) {
    return { kind: "invalid_order_command" } as const;
  }
  return persistTransition(sql, result.value, { key, context });
}

function deliveryActor(sql: TransactionSql, scope: AuthorizationScope, order: StateRow) {
  return scope.role === "standard" || scope.role === "courier"
    ? readAssignedCourier(sql, scope, order)
    : undefined;
}

export async function applyOrderCommand(
  sql: TransactionSql,
  request: OrderCommandRequest,
  deliveryKey?: Uint8Array,
) {
  const [account] = await sql`
    SELECT FROM public.users WHERE id = ${request.accountId} AND deleted_at IS NULL AND blocked_at IS NULL FOR SHARE
  `;
  if (!account) return { kind: "not_found" } as const;
  const order = await readOrderSnapshot(sql, request.orderId, true);
  if (!order) return { kind: "not_found" } as const;
  const preferMerchant =
    request.action.kind !== "cancel" || order.status === "accepted" || order.status === "ready";
  const scope = {
    ...request,
    lockRole: true,
    preferMerchant,
    allowCourier: request.action.kind === "pickUp",
  };
  const actor =
    request.action.kind === "deliver" ||
    request.action.kind === "deliverPhoto" ||
    request.action.kind === "fail"
      ? await deliveryActor(sql, scope, order)
      : await authorizeOrder(sql, scope, order);
  return actor
    ? commitCommand(sql, request, { order, actor, deliveryKey })
    : ({ kind: "not_found" } as const);
}
