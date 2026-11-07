import { applyOrderAction, change, isTime, prepare } from "./order-action.ts";
import { placeOrder } from "./order-placement.ts";
import type {
  OrderAction,
  OrderActor,
  OrderCommandReceipt,
  OrderEvent,
  OrderSnapshot,
  OrderStatus,
  OrderTransition,
  OrderTransitionError,
  TransitionInput,
} from "./order-types.ts";
import { fail, type Result } from "./result.ts";

type TransitionResult = Result<OrderTransition, OrderTransitionError>;
type Scope = OrderCommandReceipt["scope"];

const terminal = new Set<OrderStatus>([
  "delivered",
  "collected",
  "rejected",
  "expired",
  "cancelled",
  "delivery_failed",
]);
const merchantActions = new Set<OrderAction["kind"]>([
  "cancel",
  "accept",
  "reject",
  "markReady",
  "assignCourier",
  "pickUp",
  "collect",
]);
const courierActions = new Set<OrderAction["kind"]>(["pickUp", "deliver", "fail"]);

function isAssignedCourier(actor: Extract<OrderActor, { kind: "courier" }>, order: OrderSnapshot) {
  return actor.courierId === order.courierId && actor.merchantId === order.merchantId;
}

function canAct(actor: OrderActor, order: OrderSnapshot, kind: OrderAction["kind"]): boolean {
  switch (actor.kind) {
    case "customer":
      return kind === "cancel" && actor.id === order.customerId;
    case "merchant":
      return merchantActions.has(kind) && actor.merchantIds.includes(order.merchantId);
    case "courier":
      return courierActions.has(kind) && isAssignedCourier(actor, order);
    case "admin":
      return kind === "force";
    case "system":
      return kind === "expire" || kind === "release";
  }
}

function authorizedScope({ actor, order, command }: TransitionInput): Scope | null {
  if (command.action.kind === "place") {
    return actor.kind === "customer" && actor.id === command.action.facts.quoteCustomerId
      ? { kind: "place", customerId: actor.id }
      : null;
  }
  return order && canAct(actor, order, command.action.kind)
    ? { kind: "order", orderId: order.id }
    : null;
}

function sameScope(a: Scope, b: Scope): boolean {
  if (a.kind === "place") return b.kind === "place" && a.customerId === b.customerId;
  return b.kind === "order" && a.orderId === b.orderId;
}

function replay(
  { actor, command }: TransitionInput,
  scope: Scope,
  receipt: OrderCommandReceipt,
): TransitionResult {
  const matches =
    sameScope(scope, receipt.scope) &&
    actor.kind === receipt.actor.kind &&
    actor.id === receipt.actor.id &&
    command.idempotencyKey === receipt.idempotencyKey &&
    command.action.kind === receipt.action &&
    command.expectedVersion === receipt.expectedVersion &&
    command.requestFingerprint === receipt.requestFingerprint;
  return matches
    ? { ok: true, value: { kind: "replayed", order: receipt.order } }
    : fail("idempotency_conflict");
}

function complete(
  { actor, command }: TransitionInput,
  scope: Scope,
  eventData: { order: OrderSnapshot; from: OrderStatus | null; payload: OrderEvent["payload"] },
): TransitionResult {
  const { order, from, payload } = eventData;
  const eventActor = { kind: actor.kind, id: actor.id };
  return {
    ok: true,
    value: {
      kind: "applied",
      order,
      event: {
        orderId: order.id,
        actor: eventActor,
        from,
        to: order.status,
        payload,
        at: order.lastEventAt,
        version: order.version,
      },
      receipt: {
        scope,
        actor: eventActor,
        idempotencyKey: command.idempotencyKey,
        action: command.action.kind,
        expectedVersion: command.expectedVersion,
        requestFingerprint: command.requestFingerprint,
        order,
      },
    },
  };
}

function cancellationAllowed(status: OrderStatus, actor: OrderActor): boolean {
  return actor.kind === "customer"
    ? status === "scheduled" || status === "pending_acceptance"
    : status === "accepted" || status === "ready";
}

function resolveAction(input: TransitionInput, order: OrderSnapshot) {
  const { action } = input.command;
  switch (action.kind) {
    case "cancel":
      if (!cancellationAllowed(order.status, input.actor)) return fail("invalid_order_transition");
      return withReason("cancelled", action);
    case "force":
      if (!forceTargetAllowed(order, action.to)) return fail("invalid_order_transition");
      return withReason(action.to, action);
    case "markReady":
    case "pickUp":
    case "collect":
      return prepare(order, action);
    case "place":
      return fail("invalid_order_transition");
    default:
      return applyOrderAction({ order, now: input.now }, action);
  }
}

function forceTargetAllowed(order: OrderSnapshot, target: OrderStatus): boolean {
  const completed = order.fulfilment === "delivery" ? "delivered" : "collected";
  return target === "cancelled" || target === completed;
}

function withReason(status: OrderStatus, action: { kind: "cancel" | "force"; reason: string }) {
  const reason = action.reason.trim();
  return reason ? change(status, { kind: action.kind, reason }) : fail("invalid_order_command");
}

function advance(input: TransitionInput, order: OrderSnapshot, scope: Scope): TransitionResult {
  const version = order.version + 1;
  if (!Number.isSafeInteger(version) || input.command.expectedVersion !== order.version)
    return fail("order_conflict");
  if (terminal.has(order.status)) return fail("order_terminal");
  const updated = resolveAction(input, order);
  if (!updated.ok) return updated;
  const { fields, payload } = updated.value;
  const next = {
    ...order,
    ...fields,
    version,
    lastEventAt: Math.max(order.lastEventAt, input.now),
  };
  return complete(input, scope, { order: next, from: order.status, payload });
}

export function transition(input: TransitionInput): TransitionResult {
  const { command, order, now, priorReceipt } = input;
  const scope = authorizedScope(input);
  if (!scope) return fail("order_forbidden");
  if (priorReceipt) return replay(input, scope, priorReceipt);
  if (!isTime(now) || !command.idempotencyKey.trim() || !command.requestFingerprint.trim())
    return fail("invalid_order_command");
  if (order) return advance(input, order, scope);
  if (command.action.kind !== "place") return fail("invalid_order_transition");
  if (command.expectedVersion !== 0) return fail("order_conflict");
  const placed = placeOrder(command.action.facts, now);
  return placed.ok
    ? complete(input, scope, { order: placed.value, from: null, payload: { kind: "place" } })
    : placed;
}
