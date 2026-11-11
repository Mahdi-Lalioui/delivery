import { z } from "zod";
import { algerianMobilePhone } from "./auth.js";
import { orderStatus, orderSummary } from "./orders.js";

const cursor = z.strictObject({ orderId: z.uuid(), placedAt: z.iso.datetime() });
const restaurantName = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .refine((value) => !value.includes("\0"));
const filter = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("code"), code: orderSummary.shape.shortCode }),
  z.strictObject({ kind: z.literal("phone"), phone: algerianMobilePhone }),
  z.strictObject({ kind: z.literal("restaurant"), name: restaurantName }),
]);

export const adminOrderSearchInput = z.strictObject({
  scope: z.enum(["live", "all"]).default("live"),
  status: orderStatus.optional(),
  filter: filter.optional(),
  cursor: cursor.optional(),
  limit: z.int().min(1).max(50).default(20),
});

const adminOrder = orderSummary.extend({ restaurantName: z.string().min(1) });
export const adminOrderSearchOutput = z.strictObject({
  sessionId: z.uuid(),
  orders: z.array(adminOrder).max(50),
  nextCursor: cursor.nullable(),
});

const timelineEvent = z.strictObject({
  version: orderSummary.shape.version,
  from: orderStatus.nullable(),
  to: orderStatus,
  actor: z.enum(["customer", "merchant", "courier", "admin", "system"]),
  reason: z.string().max(500).nullable(),
  at: z.iso.datetime(),
});

export const adminOrderDetailOutput = z.strictObject({
  sessionId: z.uuid(),
  order: adminOrder,
  events: z.array(timelineEvent).max(100),
  hasEarlierEvents: z.boolean(),
});
