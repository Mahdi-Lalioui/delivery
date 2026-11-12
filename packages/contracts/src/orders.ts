import { z } from "zod";
import { algerianMobilePhone } from "./auth.js";
import { menuItemInput } from "./menu.js";
import { customerOrderHistoryOutput } from "./retention.js";

export const orderStatus = customerOrderHistoryOutput.shape.orders.element.shape.status;
const uuid = z.uuid();
const instant = z.iso.datetime();
const dzd = z.int().min(0).max(2_147_483_647);
const reason = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes("\0"));
const idList = z
  .array(uuid)
  .max(50)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length);
const timing = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("asap") }),
  z.strictObject({ kind: z.literal("scheduled"), scheduledFor: instant }),
]);
const quote = z.strictObject({
  merchantId: uuid,
  timing,
  items: z
    .array(
      z.strictObject({
        itemId: uuid,
        quantity: z.int().min(1).max(20),
        optionIds: idList,
        note: reason.max(140).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export const orderQuoteInput = z.discriminatedUnion("fulfilment", [
  quote.extend({ fulfilment: z.literal("pickup") }),
  quote.extend({ fulfilment: z.literal("delivery"), addressId: uuid }),
]);

export const orderQuoteOutput = z
  .strictObject({
    quoteId: uuid,
    fulfilment: z.enum(["pickup", "delivery"]),
    expiresAt: instant,
    subtotalDzd: dzd,
    deliveryFeeDzd: dzd,
    totalDzd: dzd,
  })
  .refine(
    ({ fulfilment, subtotalDzd, deliveryFeeDzd, totalDzd }) =>
      totalDzd === subtotalDzd + deliveryFeeDzd &&
      (fulfilment === "delivery" || deliveryFeeDzd === 0),
    { path: ["totalDzd"] },
  );

export const customerSmsStatus = z.enum(["rejected", "expired", "cancelled", "delivery_failed"]);
export const orderPlacementInput = z.strictObject({
  quoteId: uuid,
  payingWithDzd: dzd.optional(),
  locale: z.enum(["ar", "fr", "en"]).optional(),
});

export const orderPlacementWithContactInput = orderPlacementInput.extend({
  contactPhone: algerianMobilePhone.optional(),
});

export const orderParams = z.strictObject({ orderId: uuid });
export const orderEta = z
  .strictObject({ earliestAt: instant, latestAt: instant })
  .refine(({ earliestAt, latestAt }) => Date.parse(earliestAt) <= Date.parse(latestAt), {
    path: ["latestAt"],
  });

export const orderSummary = z.strictObject({
  orderId: uuid,
  merchantId: uuid,
  status: orderStatus,
  fulfilment: z.enum(["delivery", "pickup"]),
  shortCode: z.string().regex(/^[A-HJ-KM-NP-Z2-9]{3}-[A-HJ-KM-NP-Z2-9]{3}$/u),
  version: z.int().positive(),
  placedAt: instant,
  scheduledFor: instant.nullable(),
  acceptanceDeadlineAt: instant.nullable(),
  eta: orderEta.nullable(),
  totalDzd: dzd,
});

const command = z.strictObject({ expectedVersion: z.int().positive() });
export const deliveryCode = z.string().regex(/^[0-9]{4}$/u);
export const orderActionInputs = {
  accept: command.extend({ prepMinutes: z.int().min(5).max(120) }),
  reject: command.extend({
    reason: z.enum(["closed", "too_busy", "item_unavailable", "other"]),
    soldOutItemIds: idList.optional(),
  }),
  cancel: command.extend({ reason }),
  ready: command,
  assign: command.extend({ courierId: uuid }),
  "pick-up": command,
  collect: command,
  deliver: command.extend({
    proof: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("code"), code: deliveryCode }),
      z.strictObject({ kind: z.literal("photo"), photoId: uuid, reason }),
    ]),
  }),
  fail: command.extend({ reason }),
  force: command.extend({ to: z.enum(["cancelled", "delivered", "collected"]), reason }),
};

export const merchantBoardCursor = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/u)
  .refine((cursor) => cursor.length < 19 || cursor <= "9223372036854775807");
const boardLine = z.strictObject({
  itemId: uuid,
  names: menuItemInput.shape.names,
  quantity: z.int().min(1).max(20),
  options: z.array(menuItemInput.shape.names).max(50),
  note: z.string().max(140),
});
export const orderRealtimeQuery = z.discriminatedUnion("topic", [
  z.strictObject({
    topic: z.literal("merchantOrders"),
    merchantId: uuid,
    after: merchantBoardCursor.optional(),
  }),
  z.strictObject({
    topic: z.literal("order"),
    orderId: uuid,
    after: merchantBoardCursor.optional(),
  }),
]);
export const merchantBoardQuery = z.strictObject({ after: merchantBoardCursor.optional() });
export const merchantBoardOutput = z.strictObject({
  deliveryProofs: z
    .array(
      z.strictObject({
        orderId: uuid,
        photoId: uuid,
        shortCode: orderSummary.shape.shortCode,
        reason,
        at: instant,
      }),
    )
    .max(20)
    .optional(),
  orders: z.array(
    orderSummary.extend({
      status: z.enum(["pending_acceptance", "accepted", "ready"]),
      lines: z.array(boardLine).max(50),
      changeDzd: z.int().min(0).max(10_000),
      confirmByPhone: z.boolean(),
      customerPhone: algerianMobilePhone.optional(),
      canHandover: z.boolean(),
      courierId: uuid.nullable().optional(),
    }),
  ),
  events: z
    .array(
      z.strictObject({
        id: merchantBoardCursor,
        orderId: uuid,
        version: z.int().positive(),
        status: orderStatus,
        at: instant,
      }),
    )
    .max(100),
  cursor: merchantBoardCursor,
  hasMore: z.boolean(),
});
