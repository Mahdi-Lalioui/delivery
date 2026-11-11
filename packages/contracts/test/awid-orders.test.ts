import { expect, test } from "vitest";
import { addressInput } from "../src/addresses.ts";
import { courierPositionsInput } from "../src/courier.ts";
import {
  orderActionInputs,
  orderPlacementInput,
  orderQuoteInput,
  orderQuoteOutput,
} from "../src/orders.ts";
import { publicTrackingOutput } from "../src/tracking.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";
const point = { latitude: 36.76, longitude: 3.05 };
const quote = {
  merchantId: id,
  fulfilment: "pickup",
  timing: { kind: "asap" },
  items: [{ itemId: id, quantity: 1, optionIds: [] }],
};
const now = "2026-11-11T16:00:00Z";

test("[CUS-11:contract] accepts a pin and rejects caller-owned identity and invalid coordinates", () => {
  const address = { label: "Maison", pin: point, landmark: "Près de la poste" };
  expect(addressInput.parse(address)).toEqual(address);
  expect(addressInput.safeParse({ ...address, customerId: id }).success).toBe(false);
  expect(addressInput.safeParse({ ...address, pin: { ...point, longitude: 181 } }).success).toBe(
    false,
  );
});

test("[CUS-13:contract] requires an address for delivery and forbids one for pickup", () => {
  expect(orderQuoteInput.parse(quote)).toEqual(quote);
  expect(orderQuoteInput.safeParse({ ...quote, addressId: id }).success).toBe(false);
  expect(orderQuoteInput.safeParse({ ...quote, fulfilment: "delivery" }).success).toBe(false);
  const delivery = { ...quote, fulfilment: "delivery", addressId: id };
  expect(orderQuoteInput.parse(delivery)).toEqual(delivery);
  expect(orderQuoteInput.safeParse({ ...delivery, customerId: id }).success).toBe(false);
});

test("[MON-09:contract] bounds quote and placement money, with no pickup fee", () => {
  const output = {
    quoteId: id,
    fulfilment: "pickup",
    expiresAt: now,
    subtotalDzd: 500,
    deliveryFeeDzd: 0,
    totalDzd: 500,
  };
  expect(orderQuoteOutput.parse(output)).toEqual(output);
  expect(
    orderQuoteOutput.safeParse({ ...output, deliveryFeeDzd: 100, totalDzd: 600 }).success,
  ).toBe(false);
  expect(orderQuoteOutput.safeParse({ ...output, totalDzd: 500.1 }).success).toBe(false);
  const placement = { quoteId: id, payingWithDzd: 1000 };
  expect(orderPlacementInput.parse(placement)).toEqual(placement);
  expect(orderPlacementInput.safeParse({ ...placement, totalDzd: 1 }).success).toBe(false);
});

test("[ORD-03:contract] version is required and actor and server facts cannot be submitted", () => {
  const accept = { expectedVersion: 1, prepMinutes: 15 };
  expect(orderActionInputs.accept.parse(accept)).toEqual(accept);
  expect(orderActionInputs.accept.safeParse({ prepMinutes: 15 }).success).toBe(false);
  expect(orderActionInputs.accept.safeParse({ ...accept, actor: "admin" }).success).toBe(false);
  expect(
    orderActionInputs.fail.safeParse({ expectedVersion: 2, reason: "Absent", callAttempts: 2 })
      .success,
  ).toBe(false);
  expect(
    orderActionInputs.deliver.safeParse({
      expectedVersion: 3,
      proof: { kind: "code", code: "0123" },
    }).success,
  ).toBe(true);
});

test("[CUS-18:contract] public tracking excludes delivery codes and exact addresses", () => {
  const status = {
    fulfilment: "delivery",
    status: "out_for_delivery",
    customerFirstName: "Amel",
    eta: null,
    timeline: [],
  };
  expect(publicTrackingOutput.parse(status)).toEqual(status);
  expect(publicTrackingOutput.safeParse({ ...status, deliveryCode: "1234" }).success).toBe(false);
  expect(publicTrackingOutput.safeParse({ ...status, destination: point }).success).toBe(false);
});

test("[COU-04:contract] batches at most 50 accurate points without caller identity", () => {
  const position = { ...point, accuracyM: 100, capturedAt: now };
  expect(courierPositionsInput.parse({ orderId: id, positions: [position] }).positions).toEqual([
    position,
  ]);
  expect(
    courierPositionsInput.safeParse({ orderId: id, positions: Array(51).fill(position) }).success,
  ).toBe(false);
  expect(
    courierPositionsInput.safeParse({ orderId: id, positions: [{ ...position, accuracyM: 101 }] })
      .success,
  ).toBe(false);
  expect(
    courierPositionsInput.safeParse({ orderId: id, courierId: id, positions: [position] }).success,
  ).toBe(false);
});
