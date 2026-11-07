import fc from "fast-check";
import { assertDomainProperty } from "./property.ts";
import { expect, test } from "vitest";
import { transition } from "../src/order-transition.ts";
import type {
  OrderAction,
  OrderActor,
  OrderCommand,
  OrderCommandReceipt,
  OrderSnapshot,
  OrderStatus,
  OrderTransitionError,
  TransitionInput,
} from "../src/order-types.ts";

const clock = 2_000_000;
const timeout = 480_000;
const eta = { earliestAt: clock + 900_000, latestAt: clock + 1_200_000 };
const merchant: OrderActor = { kind: "merchant", id: "member-a", merchantIds: ["merchant-a"] };
const customer: OrderActor = { kind: "customer", id: "customer-a" };
const courier: OrderActor = {
  kind: "courier",
  id: "driver-user-a",
  courierId: "courier-a",
  merchantId: "merchant-a",
};
const admin: OrderActor = { kind: "admin", id: "admin-a" };
const system: OrderActor = { kind: "system", id: null };

function snapshot(
  status: OrderStatus = "pending_acceptance",
  overrides: Partial<OrderSnapshot> = {},
): OrderSnapshot {
  return {
    id: "order-a",
    customerId: "customer-a",
    merchantId: "merchant-a",
    fulfilment: "delivery",
    status,
    courierId: null,
    version: 3,
    lastEventAt: clock - 1_000,
    scheduledFor: status === "scheduled" ? clock + 1_200_000 : null,
    releaseAt: status === "scheduled" ? clock : null,
    acceptanceDeadlineAt: status === "scheduled" ? null : clock + timeout,
    prepMinutes: null,
    eta: null,
    ...overrides,
  };
}

type RunOptions = Omit<Partial<TransitionInput>, "command"> & {
  command?: Partial<Omit<OrderCommand, "action">>;
};

function run(action: OrderAction, options: RunOptions = {}) {
  const { order = snapshot(), actor = merchant, now = clock, command, priorReceipt } = options;
  return transition({
    order,
    actor,
    now,
    command: {
      action,
      expectedVersion: order?.version ?? 0,
      idempotencyKey: "command-key",
      requestFingerprint: "request-fingerprint",
      ...command,
    },
    ...(priorReceipt === undefined ? {} : { priorReceipt }),
  });
}

function applied(result: ReturnType<typeof transition>) {
  if (!result.ok || result.value.kind !== "applied") {
    throw new Error(`Expected an applied transition, received ${JSON.stringify(result)}`);
  }
  return result.value;
}

function expectError(result: ReturnType<typeof transition>, code: OrderTransitionError["code"]) {
  expect(result).toEqual({ ok: false, error: { code } });
}

const place = {
  kind: "place",
  facts: {
    orderId: "order-a",
    quoteCustomerId: "customer-a",
    merchantId: "merchant-a",
    fulfilment: "delivery",
    isQuoteValid: true,
    isInsideServiceArea: true,
    isInsideDeliveryZone: true,
    meetsMinimumOrder: true,
    hasVerifiedPhone: true,
    isWithinCashLimit: true,
    isCustomerBlocked: false,
    schedule: { kind: "asap", isRestaurantOpen: true, acceptanceTimeoutMs: timeout },
  },
} as const satisfies OrderAction;
const scheduled = {
  kind: "scheduled",
  scheduledFor: clock + 1_200_000,
  releaseAt: clock + 600_000,
  isSlotValid: true,
} as const;
const accept = { kind: "accept", prepMinutes: 15, facts: { eta } } as const satisfies OrderAction;
const assign = {
  kind: "assignCourier",
  courierId: "courier-a",
  facts: {
    courier: { id: "courier-a", merchantId: "merchant-a", isActive: true },
  },
} as const satisfies OrderAction;
const deliver = {
  kind: "deliver",
  facts: {
    proof: { kind: "code", isCodeValid: true, failedAttempts: 4 },
  },
} as const satisfies OrderAction;
const fail = {
  kind: "fail",
  reason: "No answer",
  facts: {
    waitStartedAt: clock - 600_000,
    callAttempts: 2,
  },
} as const satisfies OrderAction;
const force = { kind: "force", to: "cancelled", reason: "Confirmed duplicate" } as const;
const onRoad = snapshot("out_for_delivery", { courierId: courier.courierId });

test("[M1-2] places an ASAP order and starts its acceptance clock", () => {
  const result = applied(run(place, { order: null, actor: customer }));
  expect(result.order).toMatchObject({
    id: "order-a",
    customerId: "customer-a",
    status: "pending_acceptance",
    version: 1,
    acceptanceDeadlineAt: clock + timeout,
    scheduledFor: null,
    releaseAt: null,
  });
  expect(result.event).toMatchObject({
    from: null,
    to: "pending_acceptance",
    payload: { kind: "place" },
  });
  expect(result.receipt.scope).toEqual({ kind: "place", customerId: customer.id });
});

test("[M1-2] places a scheduled order without starting the acceptance clock", () => {
  const action = { ...place, facts: { ...place.facts, schedule: scheduled } };
  expect(applied(run(action, { order: null, actor: customer })).order).toMatchObject({
    status: "scheduled",
    scheduledFor: scheduled.scheduledFor,
    releaseAt: scheduled.releaseAt,
    acceptanceDeadlineAt: null,
  });
});

test("[ORD-04:domain] place replays for the same customer despite changed trusted facts", () => {
  const { order, receipt } = applied(run(place, { order: null, actor: customer }));
  const retry = { ...place, facts: { ...place.facts, orderId: "new-id", isQuoteValid: false } };

  expect(run(retry, { order: null, actor: customer, priorReceipt: receipt })).toEqual({
    ok: true,
    value: { kind: "replayed", order },
  });
});

test.each([
  { isQuoteValid: false },
  { isInsideServiceArea: false },
  { isInsideDeliveryZone: false },
  { meetsMinimumOrder: false },
  { hasVerifiedPhone: false },
  { isWithinCashLimit: false },
  { isCustomerBlocked: true },
  { schedule: { ...place.facts.schedule, isRestaurantOpen: false } },
  { schedule: { ...scheduled, isSlotValid: false } },
])("[M1-2] refuses placement with failed trusted facts %j", (facts) => {
  expectError(
    run({ ...place, facts: { ...place.facts, ...facts } }, { order: null, actor: customer }),
    "invalid_order_command",
  );
});

test("[M1-2] only the quoted customer may place the order", () => {
  expectError(run(place, { order: null, actor: merchant }), "order_forbidden");
  expectError(
    run(place, { order: null, actor: { kind: "customer", id: "customer-b" } }),
    "order_forbidden",
  );
});

test("[M1-2] releases exactly when due and starts a new acceptance window", () => {
  const order = snapshot("scheduled");
  const release = { kind: "release", facts: { acceptanceTimeoutMs: timeout } } as const;
  expectError(run(release, { order, actor: system, now: clock - 1 }), "order_not_due");
  expect(applied(run(release, { order, actor: system })).order).toMatchObject({
    status: "pending_acceptance",
    acceptanceDeadlineAt: clock + timeout,
  });
  const lateRelease = clock + 60_000;
  expect(applied(run(release, { order, actor: system, now: lateRelease })).order).toMatchObject({
    status: "pending_acceptance",
    acceptanceDeadlineAt: lateRelease + timeout,
  });
});

test("[M1-2] expiration uses the actual acceptance deadline, including equality", () => {
  const order = snapshot("pending_acceptance", {
    acceptanceDeadlineAt: clock,
    lastEventAt: clock + 5,
  });
  expectError(run({ kind: "expire" }, { order, actor: system, now: clock - 1 }), "order_not_due");
  const result = applied(run({ kind: "expire" }, { order, actor: system }));
  expect(result.order.status).toBe("expired");
  expect(result.event.at).toBe(clock + 5);
});

test.each([5, 120])(
  "[M1-2] accepts with %i minutes and publishes the supplied ETA",
  (prepMinutes) => {
    const result = applied(run({ ...accept, prepMinutes }));
    expect(result.order).toMatchObject({ status: "accepted", prepMinutes, eta });
    expect(result.event.payload).toEqual({ kind: "accept", prepMinutes, eta });
  },
);

test.each([4, 121, 5.5])("[M1-2] rejects invalid prep time %s", (prepMinutes) => {
  expectError(run({ ...accept, prepMinutes }), "invalid_order_command");
});

test("[M1-2] rejects an inverted ETA", () => {
  expectError(
    run({ ...accept, facts: { eta: { earliestAt: clock + 2, latestAt: clock + 1 } } }),
    "invalid_order_command",
  );
});

test.each([accept, { kind: "reject", reason: "closed", facts: { soldOutItemIds: [] } }] as const)(
  "[M1-2] merchant decisions close when acceptance expires: %j",
  (action) => {
    const order = snapshot("pending_acceptance", { acceptanceDeadlineAt: clock });
    expect(run(action, { order, now: clock - 1 }).ok).toBe(true);
    expectError(run(action, { order }), "invalid_order_transition");
    expectError(run(action, { order, now: clock + 1 }), "invalid_order_transition");
  },
);

test("[M1-2] rejection records the reason and sold-out item IDs", () => {
  const result = applied(
    run({ kind: "reject", reason: "item_unavailable", facts: { soldOutItemIds: ["item-a"] } }),
  );
  expect(result.order.status).toBe("rejected");
  expect(result.event.payload).toEqual({
    kind: "reject",
    reason: "item_unavailable",
    soldOutItemIds: ["item-a"],
  });
});

test("[M1-2] only an accepted order can be marked ready", () => {
  const action = { kind: "markReady" } as const;
  expect(applied(run(action, { order: snapshot("accepted") })).order.status).toBe("ready");
  expectError(run(action), "invalid_order_transition");
});

test.each(["accepted", "ready"] as const)(
  "[M1-2] courier assignment leaves the order %s",
  (status) => {
    const result = applied(run(assign, { order: snapshot(status) }));
    expect(result.order).toMatchObject({ status, courierId: courier.courierId, version: 4 });
    expect(result.event).toMatchObject({
      from: status,
      to: status,
      payload: { kind: "assignCourier", courierId: courier.courierId },
    });
  },
);

test.each([
  null,
  { ...assign.facts.courier, isActive: false },
  { ...assign.facts.courier, merchantId: "merchant-b" },
  { ...assign.facts.courier, id: "courier-b" },
])("[M1-2] rejects assignment with ineligible courier facts %j", (candidate) => {
  expectError(
    run({ ...assign, facts: { courier: candidate } }, { order: snapshot("ready") }),
    "invalid_order_command",
  );
});

test.each([merchant, courier])(
  "[M1-2] %j can pick up a ready delivery with an assigned courier",
  (actor) => {
    const order = snapshot("ready", { courierId: courier.courierId });
    expect(applied(run({ kind: "pickUp" }, { order, actor })).order.status).toBe(
      "out_for_delivery",
    );
  },
);

test("[M1-2] blocks pickup for unassigned orders and pickup fulfilment", () => {
  expectError(run({ kind: "pickUp" }, { order: snapshot("ready") }), "invalid_order_transition");
  expectError(
    run(
      { kind: "pickUp" },
      { order: snapshot("ready", { fulfilment: "pickup", courierId: courier.courierId }) },
    ),
    "invalid_order_transition",
  );
});

test("[M1-2] valid code delivery records a sanitized proof", () => {
  const result = applied(run(deliver, { order: onRoad, actor: courier }));
  expect(result.order.status).toBe("delivered");
  expect(result.event.payload).toEqual({ kind: "deliver", proof: { kind: "code" } });
});

test.each([
  { isCodeValid: false, failedAttempts: 4 },
  { isCodeValid: true, failedAttempts: 5 },
])("[M1-2] rejects invalid or locked delivery codes %j", (proof) => {
  const action = { kind: "deliver", facts: { proof: { kind: "code", ...proof } } } as const;
  expectError(run(action, { order: onRoad, actor: courier }), "invalid_order_command");
});

test("[M1-2] verified photo delivery retains only its proof reference and reason", () => {
  const proof = {
    kind: "photo",
    photoId: "photo-a",
    reason: "Code unavailable",
    isPhotoVerified: true,
  } as const;
  const result = applied(
    run({ kind: "deliver", facts: { proof } }, { order: onRoad, actor: courier }),
  );
  expect(result.event.payload).toEqual({
    kind: "deliver",
    proof: { kind: "photo", photoId: "photo-a", reason: "Code unavailable" },
  });
  expectError(
    run(
      { kind: "deliver", facts: { proof: { ...proof, isPhotoVerified: false } } },
      { order: onRoad, actor: courier },
    ),
    "invalid_order_command",
  );
});

test("[M1-2] failure requires two calls and a full ten-minute wait", () => {
  expect(applied(run(fail, { order: onRoad, actor: courier })).order.status).toBe(
    "delivery_failed",
  );
  expect(run(fail, { order: onRoad, actor: courier, now: clock - 1 }).ok).toBe(false);
  expect(
    run({ ...fail, facts: { ...fail.facts, callAttempts: 1 } }, { order: onRoad, actor: courier })
      .ok,
  ).toBe(false);
});

test("[M1-2] only ready pickup orders can be collected", () => {
  const action = { kind: "collect" } as const;
  expect(
    applied(run(action, { order: snapshot("ready", { fulfilment: "pickup" }) })).order.status,
  ).toBe("collected");
  expectError(run(action, { order: snapshot("ready") }), "invalid_order_transition");
});

test.each([
  ["scheduled", customer],
  ["pending_acceptance", customer],
  ["accepted", merchant],
  ["ready", merchant],
] as const)("[M1-2] cancels a %s order with a reason", (status, actor) => {
  const order = snapshot(status);
  expect(
    applied(run({ kind: "cancel", reason: "Change of plans" }, { order, actor })).order.status,
  ).toBe("cancelled");
  expectError(run({ kind: "cancel", reason: " " }, { order, actor }), "invalid_order_command");
});

test("[M1-2] admin force records actor and reason and respects fulfilment", () => {
  const result = applied(run(force, { actor: admin }));
  expect(result.event).toMatchObject({
    to: "cancelled",
    actor: admin,
    payload: { kind: "force", reason: force.reason },
  });
  expectError(run({ ...force, reason: " " }, { actor: admin }), "invalid_order_command");
  expectError(run({ ...force, to: "collected" }, { actor: admin }), "invalid_order_transition");
  expectError(run(force), "order_forbidden");
});

test.each([
  ["delivery", "delivered"],
  ["pickup", "collected"],
] as const)("[M1-2] admin can complete a %s order as %s", (fulfilment, to) => {
  const order = snapshot("accepted", { fulfilment });
  const result = applied(run({ ...force, to }, { order, actor: admin }));
  expect(result.order.status).toBe(to);
  expect(result.event.actor).toEqual(admin);
});

test("[M1-2] denies access across merchant, customer and courier scopes", () => {
  expectError(
    run(accept, { actor: { ...merchant, merchantIds: ["merchant-b"] } }),
    "order_forbidden",
  );
  expectError(
    run(
      { kind: "cancel", reason: "Changed plans" },
      { actor: { kind: "customer", id: "customer-b" } },
    ),
    "order_forbidden",
  );
  expectError(
    run(deliver, { order: onRoad, actor: { ...courier, courierId: "courier-b" } }),
    "order_forbidden",
  );
  expectError(
    run(deliver, { order: onRoad, actor: { ...courier, merchantId: "merchant-b" } }),
    "order_forbidden",
  );
});

const terminals = [
  "delivered",
  "collected",
  "rejected",
  "expired",
  "cancelled",
  "delivery_failed",
] as const;

test.each(terminals)("[ORD-01] terminal state %s rejects a fresh authorized command", (status) => {
  const order = snapshot(status);
  expectError(run(force, { order, actor: admin }), "order_terminal");
  expect(order.status).toBe(status);
});

test("[ORD-02:domain] emits one complete event and never moves time backwards", () => {
  const order = snapshot("pending_acceptance", { lastEventAt: clock + 1 });
  const result = applied(run(accept, { order }));
  expect(result.event).toEqual({
    orderId: order.id,
    actor: { kind: "merchant", id: merchant.id },
    from: "pending_acceptance",
    to: "accepted",
    payload: { kind: "accept", prepMinutes: 15, eta },
    at: clock + 1,
    version: 4,
  });
  expect(result.order.lastEventAt).toBe(clock + 1);
  expect(result.receipt).toEqual({
    scope: { kind: "order", orderId: order.id },
    actor: { kind: "merchant", id: merchant.id },
    idempotencyKey: "command-key",
    action: "accept",
    expectedVersion: 3,
    requestFingerprint: "request-fingerprint",
    order: result.order,
  });
  expect(order.status).toBe("pending_acceptance");
});

test.each([2, 4])("[ORD-03:domain] rejects conflicting expected version %i", (expectedVersion) => {
  expectError(run(accept, { command: { expectedVersion } }), "order_conflict");
});

test("[ORD-04:domain] an exact retry returns the original snapshot after later state changes", () => {
  const original = applied(run(accept));
  const order = snapshot("cancelled", { version: 8 });
  const action = { ...accept, facts: { eta: { earliestAt: clock + 10, latestAt: clock + 20 } } };

  expect(
    run(action, { order, command: { expectedVersion: 3 }, priorReceipt: original.receipt }),
  ).toEqual({
    ok: true,
    value: { kind: "replayed", order: original.order },
  });
  expectError(
    run(action, {
      order,
      actor: { ...merchant, merchantIds: [] },
      command: { expectedVersion: 3 },
      priorReceipt: original.receipt,
    }),
    "order_forbidden",
  );
});

const receiptMismatches: readonly Partial<OrderCommandReceipt>[] = [
  { scope: { kind: "order", orderId: "order-b" } },
  { actor: { kind: "merchant", id: "member-b" } },
  { action: "reject" },
  { expectedVersion: 2 },
  { idempotencyKey: "other-key" },
  { requestFingerprint: "different-request" },
];

test.each(receiptMismatches)("[ORD-04:domain] rejects a mismatched receipt %j", (mismatch) => {
  const { receipt } = applied(run(accept));
  expectError(run(accept, { priorReceipt: { ...receipt, ...mismatch } }), "idempotency_conflict");
});

test("[ORD-12] random command sequences preserve terminal, time and version invariants @property", () => {
  const start = fc.constantFrom<OrderStatus>(
    "pending_acceptance",
    "accepted",
    "ready",
    "out_for_delivery",
    ...terminals,
  );
  const actions = fc.constantFrom<OrderAction>(
    accept,
    assign,
    deliver,
    fail,
    force,
    { kind: "markReady" },
    { kind: "pickUp" },
    { kind: "expire" },
  );
  const step = fc.record({
    action: actions,
    actor: fc.constantFrom<OrderActor>(merchant, customer, courier, system, admin),
    isStale: fc.boolean(),
    now: fc.integer({ min: clock - 1_500, max: clock + timeout + 1 }),
  });

  assertDomainProperty(
    fc.property(start, fc.array(step, { minLength: 1, maxLength: 20 }), (status, steps) => {
      let order = snapshot(status, { courierId: courier.courierId });
      for (const { action, actor, isStale, now } of steps) {
        const before = structuredClone(order);
        const result = run(action, {
          order,
          actor,
          now,
          command: { expectedVersion: order.version - Number(isStale) },
        });
        expect(order).toEqual(before);
        if (!result.ok) continue;

        expect(terminals).not.toContain(before.status);
        expect(isStale).toBe(false);
        const next = applied(result);
        expect(next.order.version).toBe(before.version + 1);
        expect(next.event).toMatchObject({
          from: before.status,
          to: next.order.status,
          at: Math.max(before.lastEventAt, now),
          version: next.order.version,
        });
        expect(next.order.lastEventAt).toBe(next.event.at);
        order = next.order;
      }
    }),
  );
});

test.each([
  [{ kind: "markReady" }, snapshot("accepted")],
  [{ kind: "pickUp" }, snapshot("ready", { courierId: courier.courierId })],
  [{ kind: "collect" }, snapshot("ready", { fulfilment: "pickup" })],
] as const)("[ORD-02:domain] excludes extra action fields from %j events", (action, order) => {
  const command = { ...action, unintendedField: "service-only fixture" };
  const result = applied(run(command, { order }));
  expect(result.event.payload).toEqual(action);
  expect(result.event.payload).not.toBe(command);
});

test("[ORD-03:domain] reports a stale fresh command after another command finished the order", () => {
  const order = snapshot("cancelled", { version: 4 });
  expectError(
    run(
      { kind: "cancel", reason: "Changed plans" },
      { order, actor: customer, command: { expectedVersion: 3 } },
    ),
    "order_conflict",
  );
});

test("[ORD-01] a completed delivery cannot emit a second delivery event", () => {
  const order = snapshot("delivered", { courierId: courier.courierId });
  const result = run(deliver, { order, actor: courier });
  expectError(result, "order_terminal");
  expect(order.status).toBe("delivered");
  expect(order.version).toBe(3);
});
