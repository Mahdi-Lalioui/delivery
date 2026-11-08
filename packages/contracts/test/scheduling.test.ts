import { expect, test } from "vitest";
import { customerSlotsOutput, customerSlotsQuery, selectedSlot } from "../src/scheduling.ts";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const addressId = "01932f18-3150-7c33-8a7a-53acfd343003";
const pickup = { merchantId, fulfilment: "pickup" };
const delivery = { merchantId, fulfilment: "delivery", addressId };
const scheduled = { kind: "scheduled", scheduledFor: "2027-02-08T17:15:00.000Z" };
const iftar = { kind: "iftar", scheduledFor: "2027-02-08T18:18:00.000+01:00" };

test("[CUS-13:contract] queries pickup by restaurant and delivery by restaurant and address", () => {
  expect(customerSlotsQuery.parse(pickup)).toEqual(pickup);
  expect(customerSlotsQuery.parse(delivery)).toEqual(delivery);
});

test.each([
  ["delivery without an address", { ...pickup, fulfilment: "delivery" }],
  ["pickup with a delivery address", { ...pickup, addressId }],
  ["an invalid restaurant id", { ...pickup, merchantId: "restaurant" }],
  ["an invalid address id", { ...delivery, addressId: "address" }],
  ["an unknown fulfilment", { ...pickup, fulfilment: "dine-in" }],
  ["client-supplied travel time", { ...delivery, travelMinutes: 0 }],
])("[CUS-13:contract] rejects a slot query with %s", (_reason, query) => {
  expect(customerSlotsQuery.safeParse(query).success).toBe(false);
});

test("[HRS-02:contract] represents available or empty scheduled pickup slots", () => {
  const available = { fulfilment: "pickup", slots: [scheduled] };
  const empty = { fulfilment: "pickup", slots: [] };
  expect(customerSlotsOutput.parse(available)).toEqual(available);
  expect(customerSlotsOutput.parse(empty)).toEqual(empty);
});

test("[HRS-03:contract] carries the exact Iftar target from discovery into the selection", () => {
  const available = { fulfilment: "delivery", slots: [scheduled, iftar] };
  const result = customerSlotsOutput.parse(available);
  expect(result).toEqual(available);
  expect(result.slots.map((slot) => selectedSlot.parse(slot))).toEqual([scheduled, iftar]);
});

test.each([
  ["Iftar for pickup", { fulfilment: "pickup", slots: [iftar] }],
  ["a malformed slot", { fulfilment: "delivery", slots: [{ ...scheduled, scheduledFor: "" }] }],
  ["an unexpected field", { fulfilment: "delivery", slots: [], travelMinutes: 10 }],
])("[CUS-13:contract] rejects a slot result with %s", (_reason, output) => {
  expect(customerSlotsOutput.safeParse(output).success).toBe(false);
});

test.each([
  ["an unknown kind", { ...scheduled, kind: "asap" }],
  ["a local time without a UTC offset", { ...scheduled, scheduledFor: "2027-02-08T18:15:00" }],
  ["an impossible date", { ...scheduled, scheduledFor: "2027-02-30T17:15:00Z" }],
  ["a client-supplied release time", { ...iftar, releaseAt: "2027-02-08T16:30:00.000Z" }],
])("[CUS-13:contract] rejects a selected slot with %s", (_reason, slot) => {
  expect(selectedSlot.safeParse(slot).success).toBe(false);
});
