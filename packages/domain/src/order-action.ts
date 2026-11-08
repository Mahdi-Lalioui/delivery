import type {
  OrderAction,
  OrderEvent,
  OrderSnapshot,
  OrderTransitionError,
} from "./order-types.ts";
import { fail, type Result } from "./result.ts";

export type OrderContext = { readonly order: OrderSnapshot; readonly now: number };
export type Action<Kind extends OrderAction["kind"]> = Extract<OrderAction, { kind: Kind }>;
type Change = {
  readonly fields: Partial<OrderSnapshot> & Pick<OrderSnapshot, "status">;
  readonly payload: OrderEvent["payload"];
};
type Outcome = Result<Change, OrderTransitionError>;

export const isTime = (value: number) => Number.isSafeInteger(value) && value >= 0;

export function deadlineAt(now: number, timeout: number): number | null {
  const deadline = now + timeout;
  return Number.isSafeInteger(timeout) && timeout > 0 && isTime(deadline) ? deadline : null;
}

export function change(status: OrderSnapshot["status"], payload: OrderEvent["payload"]): Outcome {
  return { ok: true, value: { fields: { status }, payload } };
}

function release({ order, now }: OrderContext, { facts }: Action<"release">): Outcome {
  if (order.status !== "scheduled" || order.releaseAt === null)
    return fail("invalid_order_transition");
  if (now < order.releaseAt) return fail("order_not_due");
  const acceptanceDeadlineAt = deadlineAt(now, facts.acceptanceTimeoutMs);
  if (acceptanceDeadlineAt === null) return fail("invalid_order_command");
  return {
    ok: true,
    value: {
      fields: { status: "pending_acceptance", acceptanceDeadlineAt },
      payload: { kind: "release" },
    },
  };
}

function acceptanceOpen({ order, now }: OrderContext): boolean {
  return (
    order.status === "pending_acceptance" &&
    order.acceptanceDeadlineAt !== null &&
    now < order.acceptanceDeadlineAt
  );
}

function accept(context: OrderContext, { prepMinutes, facts }: Action<"accept">): Outcome {
  if (!acceptanceOpen(context)) return fail("invalid_order_transition");
  const { earliestAt, latestAt } = facts.eta;
  if (!Number.isInteger(prepMinutes) || prepMinutes < 5 || prepMinutes > 120)
    return fail("invalid_order_command");
  if (!isTime(earliestAt) || !isTime(latestAt) || latestAt < earliestAt)
    return fail("invalid_order_command");
  const eta = { earliestAt, latestAt };
  return {
    ok: true,
    value: {
      fields: { status: "accepted", prepMinutes, eta },
      payload: { kind: "accept", prepMinutes, eta },
    },
  };
}

function reject(context: OrderContext, { reason, facts }: Action<"reject">): Outcome {
  if (!acceptanceOpen(context)) return fail("invalid_order_transition");
  return change("rejected", { kind: "reject", reason, soldOutItemIds: [...facts.soldOutItemIds] });
}

function expire({ order, now }: OrderContext): Outcome {
  if (order.status !== "pending_acceptance" || order.acceptanceDeadlineAt === null)
    return fail("invalid_order_transition");
  return now >= order.acceptanceDeadlineAt
    ? change("expired", { kind: "expire" })
    : fail("order_not_due");
}

function assignCourier(order: OrderSnapshot, action: Action<"assignCourier">): Outcome {
  if (order.fulfilment !== "delivery" || !["accepted", "ready"].includes(order.status))
    return fail("invalid_order_transition");
  const { courier } = action.facts;
  if (
    courier?.id !== action.courierId ||
    !courier.isActive ||
    courier.merchantId !== order.merchantId
  )
    return fail("invalid_order_command");
  return {
    ok: true,
    value: {
      fields: { status: order.status, courierId: courier.id },
      payload: { kind: "assignCourier", courierId: courier.id },
    },
  };
}

function deliveryProof({ proof }: Action<"deliver">["facts"]): Outcome {
  if (proof.kind === "code") {
    const { failedAttempts } = proof;
    if (
      !proof.isCodeValid ||
      !Number.isInteger(failedAttempts) ||
      failedAttempts < 0 ||
      failedAttempts >= 5
    )
      return fail("invalid_order_command");
    return change("delivered", { kind: "deliver", proof: { kind: "code" } });
  }
  const reason = proof.reason.trim();
  if (!proof.isPhotoVerified || !proof.photoId.trim() || !reason)
    return fail("invalid_order_command");
  return change("delivered", {
    kind: "deliver",
    proof: { kind: "photo", photoId: proof.photoId, reason },
  });
}

function failDelivery({ order, now }: OrderContext, action: Action<"fail">): Outcome {
  if (order.status !== "out_for_delivery") return fail("invalid_order_transition");
  const { waitStartedAt, callAttempts } = action.facts;
  const reason = action.reason.trim();
  if (
    waitStartedAt === null ||
    !isTime(waitStartedAt) ||
    !Number.isInteger(callAttempts) ||
    !reason
  )
    return fail("invalid_order_command");
  if (now - waitStartedAt < 600_000 || callAttempts < 2) return fail("order_not_due");
  return change("delivery_failed", { kind: "fail", reason });
}

export function prepare(
  order: OrderSnapshot,
  action: Action<"markReady" | "pickUp" | "collect">,
): Outcome {
  if (action.kind === "markReady" && order.status === "accepted")
    return change("ready", { kind: action.kind });
  if (order.status !== "ready") return fail("invalid_order_transition");
  if (action.kind === "collect" && order.fulfilment === "pickup")
    return change("collected", { kind: action.kind });
  if (action.kind === "pickUp" && order.fulfilment === "delivery" && order.courierId !== null)
    return change("out_for_delivery", { kind: action.kind });
  return fail("invalid_order_transition");
}

export function applyOrderAction(
  context: OrderContext,
  action: Action<"release" | "accept" | "reject" | "expire" | "assignCourier" | "deliver" | "fail">,
): Outcome {
  switch (action.kind) {
    case "release":
      return release(context, action);
    case "accept":
      return accept(context, action);
    case "reject":
      return reject(context, action);
    case "expire":
      return expire(context);
    case "assignCourier":
      return assignCourier(context.order, action);
    case "deliver":
      return context.order.status === "out_for_delivery"
        ? deliveryProof(action.facts)
        : fail("invalid_order_transition");
    case "fail":
      return failDelivery(context, action);
  }
}
