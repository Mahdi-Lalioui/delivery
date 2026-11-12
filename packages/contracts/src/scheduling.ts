import { z } from "./schema.js";

const merchantId = z.uuid();

/** Delivery discovery resolves the destination from the customer's saved address. */
export const customerSlotsQuery = z.discriminatedUnion("fulfilment", [
  z.strictObject({ fulfilment: z.literal("pickup"), merchantId }),
  z.strictObject({ fulfilment: z.literal("delivery"), merchantId, addressId: z.uuid() }),
]);

const scheduledFor = z.iso.datetime({ offset: true });
const scheduledSlot = z.strictObject({ kind: z.literal("scheduled"), scheduledFor });
const iftarSlot = z.strictObject({ kind: z.literal("iftar"), scheduledFor });

/** Echo an offered slot unchanged. The server revalidates it when quoting and placing an order. */
export const selectedSlot = z.discriminatedUnion("kind", [scheduledSlot, iftarSlot]);

/** The server computes availability and the exact Iftar arrival time for the delivery address. */
export const customerSlotsOutput = z.discriminatedUnion("fulfilment", [
  z.strictObject({ fulfilment: z.literal("pickup"), slots: z.array(scheduledSlot) }),
  z.strictObject({ fulfilment: z.literal("delivery"), slots: z.array(selectedSlot) }),
]);

export const ramadanTodayQuery = z.strictObject({ communeId: z.uuid() });
export const ramadanTodayOutput = z.discriminatedUnion("isRamadan", [
  z.strictObject({ isRamadan: z.literal(false), maghribAt: z.null() }),
  z.strictObject({ isRamadan: z.literal(true), maghribAt: z.iso.datetime() }),
]);
