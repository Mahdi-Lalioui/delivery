import { orderQuoteInput, type orderPlacementInput } from "@zaafran/contracts/orders";
import { dzd } from "@zaafran/domain/money";
import { transition } from "@zaafran/domain/order-transition";
import { calculateChange } from "@zaafran/domain/pricing";
import type { OrderAction } from "@zaafran/domain/order-types";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import {
  applyOrderCommand,
  readScopedOrder,
  type OrderCommandRequest,
  type OrderAccess,
} from "./order-commands.js";
import {
  readMerchantBoard,
  readMerchantReplay,
  type BoardRequest,
  type ReplayRequest,
} from "./order-board.js";
import type { DatabaseConnection } from "./database.js";
import {
  hash,
  insertOrder,
  readOrderPolicy,
  readPlacementReceipt,
  savePlacementReceipt,
  type PricedQuote,
} from "./order-placement-store.js";
import { readCustomerTracking, type CustomerTrackingScope } from "./order-tracking.js";
import { readOrderReplay, type OrderReplayRequest } from "./order-replay.js";
import { evaluateQuote, lockOrderingCustomer, quoteBreakdown } from "./order-quotes.js";
import {
  appendOrderEvent,
  enqueueOrderTimer,
  readOrderSnapshot,
  writeOrderState,
  type OrderTimer,
} from "./order-state-store.js";

type PlacementRequest = {
  customerId: string;
  input: ReturnType<typeof orderPlacementInput.parse>;
  idempotencyKey: string;
  now: Date;
};
type Schedule = Extract<OrderAction, { kind: "place" }>["facts"]["schedule"];
type Timing = ReturnType<typeof orderQuoteInput.parse>["timing"];

function placementSchedule(
  timing: Timing,
  now: number,
  { timeoutMs, prepAndTravelMinutes }: { timeoutMs: number; prepAndTravelMinutes: number },
): Schedule {
  if (timing.kind === "asap") {
    return { kind: "asap", isRestaurantOpen: true, acceptanceTimeoutMs: timeoutMs };
  }
  const scheduledFor = Date.parse(timing.scheduledFor);
  return {
    kind: "scheduled",
    scheduledFor,
    releaseAt: Math.max(now, scheduledFor - (prepAndTravelMinutes + 10) * 60_000),
    isSlotValid: true,
  };
}

async function loadPlacementQuote(sql: TransactionSql, request: PlacementRequest) {
  const {
    customerId,
    now,
    input: { quoteId },
  } = request;
  const [stored] = await sql<{ input: unknown; consumed: boolean }[]>`
    SELECT quote.input, EXISTS (SELECT FROM public.orders WHERE quote_id = quote.id) AS consumed
    FROM public.quotes AS quote
    WHERE quote.id = ${quoteId} AND quote.customer_id = ${customerId} AND quote.expires_at > ${now.toISOString()}
    FOR SHARE
  `;
  if (!stored) return { kind: "quote_expired" } as const;
  if (stored.consumed) return { kind: "quote_consumed" } as const;
  const input = orderQuoteInput.parse(stored.input);
  // Menu, hours and merchant writes serialize on the merchant row.
  await sql`SELECT FROM public.merchants WHERE id = ${input.merchantId} FOR SHARE`;
  const evaluated = await evaluateQuote(sql, { customerId, input, now });
  if (evaluated.kind !== "priced") return { kind: "quote_changed" } as const;
  const [matches] = await sql`
    SELECT FROM public.quotes WHERE id = ${quoteId}
      AND payload_hash = sha256(convert_to(jsonb_build_array(input, ${quoteBreakdown(evaluated)}::jsonb)::text, 'UTF8'))
  `;
  return matches
    ? ({ kind: "valid", input, evaluated } as const)
    : ({ kind: "quote_changed" } as const);
}

function checkTender(totalDzd: PricedQuote["price"]["totalDzd"], tender: number | undefined) {
  const payingWith = dzd(tender ?? totalDzd);
  return payingWith.ok && calculateChange({ totalDzd, payingWithDzd: payingWith.value }).ok
    ? payingWith.value
    : undefined;
}

async function placeOrder(sql: TransactionSql, request: PlacementRequest) {
  const { customerId, now, input, idempotencyKey } = request;
  if (!(await lockOrderingCustomer(sql, customerId))) return { kind: "unauthorized" } as const;
  const key = {
    customerId,
    now,
    keyHash: hash(idempotencyKey),
    requestHash: hash(
      JSON.stringify([
        input.quoteId.toLowerCase(),
        input.payingWithDzd ?? null,
        ...(input.locale && input.locale !== "fr" ? [input.locale] : []),
      ]),
    ),
  };
  const receipt = await readPlacementReceipt(sql, key);
  if (receipt)
    return receipt.matches
      ? ({ kind: "placed", order: receipt.response } as const)
      : ({ kind: "idempotency_conflict" } as const);

  const quote = await loadPlacementQuote(sql, request);
  if (quote.kind !== "valid") return quote;
  return completePlacement(sql, request, { quote, key });
}

type ValidQuote = Extract<Awaited<ReturnType<typeof loadPlacementQuote>>, { kind: "valid" }>;

async function completePlacement(
  sql: TransactionSql,
  request: PlacementRequest,
  { quote, key }: { quote: ValidQuote; key: Parameters<typeof savePlacementReceipt>[1] },
) {
  const { customerId, now, input, idempotencyKey } = request;
  const { totalDzd } = quote.evaluated.price;
  const payingWithDzd = checkTender(totalDzd, input.payingWithDzd);
  if (payingWithDzd === undefined) return { kind: "invalid_change" } as const;
  const policy = await readOrderPolicy(sql, customerId);
  if (!policy.hasCompleted && totalDzd > policy.cashCap) return { kind: "cash_limit" } as const;
  const result = transition({
    order: null,
    actor: { kind: "customer", id: customerId },
    now: now.getTime(),
    command: {
      idempotencyKey,
      requestFingerprint: key.requestHash.toString("hex"),
      expectedVersion: 0,
      action: {
        kind: "place",
        facts: {
          orderId: randomUUID(),
          quoteCustomerId: customerId,
          merchantId: quote.input.merchantId.toLowerCase(),
          fulfilment: quote.input.fulfilment,
          isQuoteValid: true,
          isInsideServiceArea: true,
          isInsideDeliveryZone: quote.evaluated.address !== null,
          meetsMinimumOrder: true,
          hasVerifiedPhone: true,
          isWithinCashLimit: true,
          isCustomerBlocked: false,
          schedule: placementSchedule(quote.input.timing, now.getTime(), {
            timeoutMs: policy.timeoutMs,
            prepAndTravelMinutes: quote.evaluated.prepAndTravelMinutes,
          }),
        },
      },
    },
  });
  if (!result.ok) return { kind: result.error.code };
  if (result.value.kind !== "applied") throw new Error("New order unexpectedly replayed");
  const { order, event } = result.value;
  const response = await insertOrder(sql, {
    order,
    quoteId: input.quoteId,
    evaluated: quote.evaluated,
    payingWithDzd,
    confirmByPhone: policy.confirmByPhone,
    locale: input.locale ?? "fr",
  });
  await appendOrderEvent(sql, event);
  await enqueueOrderTimer(sql, order);
  await savePlacementReceipt(sql, key, response);
  return { kind: "placed", order: response } as const;
}

async function runTimer(
  sql: TransactionSql,
  { orderId, action, now }: { orderId: string; action: OrderTimer; now: Date },
) {
  const order = await readOrderSnapshot(sql, orderId, true);
  if (!order) return;
  const command: OrderAction =
    action === "release"
      ? {
          kind: "release",
          facts: { acceptanceTimeoutMs: (await readOrderPolicy(sql, order.customerId)).timeoutMs },
        }
      : { kind: "expire" };
  const result = transition({
    order,
    actor: { kind: "system", id: null },
    now: now.getTime(),
    command: {
      expectedVersion: order.version,
      idempotencyKey: action,
      requestFingerprint: action,
      action: command,
    },
  });
  if (!result.ok || result.value.kind !== "applied") return;
  await writeOrderState(sql, result.value.order);
  await appendOrderEvent(sql, result.value.event);
  if (action === "release") await enqueueOrderTimer(sql, result.value.order);
}

export function createOrderRepository({ sql }: DatabaseConnection) {
  return {
    tracking: (request: CustomerTrackingScope) =>
      sql.begin("isolation level repeatable read read only", (tx) =>
        readCustomerTracking(tx, request),
      ),
    orderReplay: (request: OrderReplayRequest) =>
      sql.begin("isolation level repeatable read read only", (tx) => readOrderReplay(tx, request)),
    merchantReplay: (request: ReplayRequest) =>
      sql.begin("isolation level repeatable read read only", (tx) =>
        readMerchantReplay(tx, request),
      ),
    board: (request: BoardRequest) =>
      sql.begin("isolation level repeatable read read only", (tx) =>
        readMerchantBoard(tx, request),
      ),
    apply: (request: OrderCommandRequest) => sql.begin((tx) => applyOrderCommand(tx, request)),
    read: (request: OrderAccess) =>
      sql.begin("isolation level repeatable read read only", (tx) => readScopedOrder(tx, request)),
    place: (request: PlacementRequest) => sql.begin((tx) => placeOrder(tx, request)),
    runTimer: (orderId: string, action: OrderTimer, now: Date) =>
      sql.begin((tx) => runTimer(tx, { orderId, action, now })),
  };
}
