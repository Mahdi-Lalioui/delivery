import { deadlineAt, isTime, type Action } from "./order-action.ts";
import type { OrderSnapshot, OrderTransitionError } from "./order-types.ts";
import { fail, type Result } from "./result.ts";

type Placement = Action<"place">["facts"];
type Schedule = Pick<
  OrderSnapshot,
  "status" | "scheduledFor" | "releaseAt" | "acceptanceDeadlineAt"
>;
type PlacementResult<T> = Result<T, OrderTransitionError>;

function resolveSchedule(schedule: Placement["schedule"], now: number): PlacementResult<Schedule> {
  if (schedule.kind === "asap") {
    const acceptanceDeadlineAt = deadlineAt(now, schedule.acceptanceTimeoutMs);
    if (!schedule.isRestaurantOpen || acceptanceDeadlineAt === null)
      return fail("invalid_order_command");
    return {
      ok: true,
      value: {
        status: "pending_acceptance",
        scheduledFor: null,
        releaseAt: null,
        acceptanceDeadlineAt,
      },
    };
  }
  const { scheduledFor, releaseAt } = schedule;
  if (
    !schedule.isSlotValid ||
    !isTime(scheduledFor) ||
    !isTime(releaseAt) ||
    scheduledFor <= now ||
    releaseAt >= scheduledFor
  )
    return fail("invalid_order_command");
  return {
    ok: true,
    value: { status: "scheduled", scheduledFor, releaseAt, acceptanceDeadlineAt: null },
  };
}

export function placeOrder(facts: Placement, now: number): PlacementResult<OrderSnapshot> {
  const allowed =
    facts.isQuoteValid &&
    facts.isInsideServiceArea &&
    (facts.fulfilment === "pickup" || facts.isInsideDeliveryZone) &&
    facts.meetsMinimumOrder &&
    facts.hasVerifiedPhone &&
    facts.isWithinCashLimit &&
    !facts.isCustomerBlocked;
  if (!allowed) return fail("invalid_order_command");
  const schedule = resolveSchedule(facts.schedule, now);
  if (!schedule.ok) return schedule;
  return {
    ok: true,
    value: {
      id: facts.orderId,
      customerId: facts.quoteCustomerId,
      merchantId: facts.merchantId,
      fulfilment: facts.fulfilment,
      courierId: null,
      version: 1,
      lastEventAt: now,
      prepMinutes: null,
      eta: null,
      ...schedule.value,
    },
  };
}
