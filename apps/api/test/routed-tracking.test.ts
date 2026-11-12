import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, test, vi } from "vitest";
import { createRoutedTracking } from "../src/routed-tracking.ts";

type Read = ReturnType<typeof createOrderRepository>["tracking"];
const orderId = "01932f18-3150-7c33-8a7a-53acfd343001";
const start = Date.parse("2026-11-11T12:00:00Z");
const pin = { latitude: 36.75, longitude: 3.06 };
const destination = { latitude: 36.76, longitude: 3.065 };
const request = { orderId, customerId: orderId, sessionId: orderId };
const tracking: NonNullable<Awaited<ReturnType<Read>>> = {
  fulfilment: "delivery",
  order: {
    orderId,
    merchantId: orderId,
    status: "out_for_delivery",
    fulfilment: "delivery",
    shortCode: "K7M-4QX",
    totalDzd: 1350,
    version: 5,
    placedAt: new Date(start).toISOString(),
    scheduledFor: null,
    acceptanceDeadlineAt: null,
    eta: null,
  },
  destination,
  restaurantPhone: null,
  shareToken: null,
  deliveryCode: null,
  route: null,
  timeline: [],
  courier: {
    firstName: null,
    phone: null,
    position: { ...pin, capturedAt: new Date(start).toISOString() },
  },
};

test("[GEO-04] only routes private active tracking and refreshes at most every thirty seconds", async () => {
  let now = start;
  const read = vi.fn<Read>().mockResolvedValue(tracking);
  const route = vi
    .fn()
    .mockResolvedValue({ distanceM: 1400, durationSeconds: 360, points: [pin, destination] });
  const view = createRoutedTracking({ read, route, now: () => now });
  const [first, duplicate] = await Promise.all([view(request), view(request)]);
  expect(first).toMatchObject({
    route: [pin, destination],
    order: {
      eta: {
        earliestAt: "2026-11-11T12:05:00.000Z",
        latestAt: "2026-11-11T12:15:00.000Z",
      },
    },
  });
  expect(duplicate).toEqual(first);
  expect(route).toHaveBeenCalledTimes(1);
  now += 29_999;
  expect(await view(request)).toEqual(first);
  expect(route).toHaveBeenCalledTimes(1);
  now++;
  await view(request);
  expect(route).toHaveBeenCalledTimes(2);
  read.mockResolvedValueOnce(undefined);
  expect(await view(request)).toBeUndefined();
  expect(route).toHaveBeenCalledTimes(2);
});
