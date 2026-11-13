import { customerTrackingOutput } from "@zaafran/contracts/tracking";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  applyTrackingPosition,
  isTerminal,
  loadTracking,
  timelineSteps,
  type Tracking,
} from "../src/tracking/tracking-http";
import { layoutMap, projectPins, splitRoute } from "../src/tracking/tracking-map";

const orderId = "00000000-0000-4000-8000-000000000501";
const merchantId = "00000000-0000-4000-8000-000000000010";
const order = {
  orderId,
  merchantId,
  status: "out_for_delivery",
  fulfilment: "delivery",
  shortCode: "ABC-DEF",
  version: 4,
  placedAt: "2026-11-11T20:00:00.000Z",
  scheduledFor: null,
  acceptanceDeadlineAt: null,
  eta: { earliestAt: "2026-11-11T20:30:00.000Z", latestAt: "2026-11-11T20:40:00.000Z" },
  totalDzd: 1700,
};
const timeline: Tracking["timeline"] = [
  { status: "pending_acceptance", at: "2026-11-11T20:00:00.000Z" },
  { status: "accepted", at: "2026-11-11T20:02:00.000Z" },
  { status: "out_for_delivery", at: "2026-11-11T20:20:00.000Z" },
];
const tracking = {
  fulfilment: "delivery",
  order,
  timeline,
  restaurantPhone: null,
  shareToken: null,
  destination: { latitude: 36.77, longitude: 3.06 },
  deliveryCode: "4821",
  courier: {
    firstName: "Yacine",
    phone: null,
    position: {
      latitude: 36.76,
      longitude: 3.05,
      heading: 45,
      capturedAt: "2026-11-11T20:25:00.000Z",
    },
  },
  route: [
    { latitude: 36.76, longitude: 3.05 },
    { latitude: 36.77, longitude: 3.06 },
  ],
};

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  server.resetHandlers();
  const intercepted = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    intercepted(new URL(input, "http://customer.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

test("[CUS-18] loads the customer's tracking view and rejects another order's payload", async () => {
  server.use(http.get("*/v1/orders/:orderId/tracking", () => HttpResponse.json(tracking)));
  expect(await loadTracking(orderId)).toEqual({ kind: "ready", tracking });
  expect(await loadTracking("00000000-0000-4000-8000-000000000999")).toEqual({ kind: "error" });
});

test("[CUS-18] maps sign-in and not-found failures", async () => {
  server.use(
    http.get("*/v1/orders/:orderId/tracking", () => new HttpResponse(null, { status: 401 })),
  );
  expect(await loadTracking(orderId)).toEqual({ kind: "sign-in" });
  server.use(
    http.get("*/v1/orders/:orderId/tracking", () => new HttpResponse(null, { status: 404 })),
  );
  expect(await loadTracking(orderId)).toEqual({ kind: "not-found" });
});

test("[CUS-18] builds the delivery and pickup timelines with reached steps", () => {
  const steps = timelineSteps("delivery", tracking.timeline);
  expect(steps.map(({ key, at }) => [key, at !== undefined])).toEqual([
    ["placed", true],
    ["accepted", true],
    ["ready", false],
    ["out_for_delivery", true],
    ["delivered", false],
  ]);
  expect(timelineSteps("pickup", []).map(({ key }) => key)).toEqual([
    "placed",
    "accepted",
    "ready",
    "collected",
  ]);
});

test("[CUS-18] stops polling once the order can no longer change", () => {
  expect(isTerminal("delivered")).toBe(true);
  expect(isTerminal("cancelled")).toBe(true);
  expect(isTerminal("out_for_delivery")).toBe(false);
});

test("[CUS-18] projects pins into the map box with north up and padding", () => {
  const [south, north] = projectPins(
    [
      { latitude: 36.7, longitude: 3.0 },
      { latitude: 36.8, longitude: 3.1 },
    ],
    { width: 400, height: 300, padding: 40 },
  );
  expect(south?.y).toBeGreaterThan(north?.y ?? 0);
  expect(south?.x).toBeLessThan(north?.x ?? 0);
  for (const point of [south, north]) {
    expect(point?.x).toBeGreaterThanOrEqual(40);
    expect(point?.y).toBeLessThanOrEqual(260);
  }
  expect(
    projectPins([{ latitude: 36.7, longitude: 3 }], { width: 400, height: 300, padding: 40 }),
  ).toEqual([{ x: 200, y: 150 }]);
});

test("[CUS-18] draws the route only from route pins and leaves the courier out without a position", () => {
  const box = { width: 400, height: 300, padding: 40 };
  const destination = { latitude: 36.77, longitude: 3.06 };
  const waiting = layoutMap({ destination, courier: null, route: [] }, box);
  expect(waiting.courier).toBeUndefined();
  expect(waiting.route).toEqual([]);
  const moving = layoutMap(
    { destination, courier: { latitude: 36.76, longitude: 3.05 }, route: [] },
    box,
  );
  expect(moving.route).toEqual([moving.courier, moving.destination]);
});

test("[CUS-18] splits the route at the courier into travelled and remaining parts", () => {
  const route = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
    { x: 30, y: 0 },
  ];
  const [done, left] = splitRoute(route, { x: 12, y: 1 });
  expect(done).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 12, y: 1 },
  ]);
  expect(left).toEqual([
    { x: 12, y: 1 },
    { x: 20, y: 0 },
    { x: 30, y: 0 },
  ]);
  expect(splitRoute(route, undefined)).toEqual([[], route]);
});

test("[CUS-18] applies only a newer live position for the tracked delivery", () => {
  const position = {
    orderId,
    latitude: 36.77,
    longitude: 3.06,
    heading: 90,
    capturedAt: "2026-11-11T20:26:00.000Z",
  };
  const view = customerTrackingOutput.parse(tracking);
  const waiting = { ...view, order: { ...view.order, status: "ready" as const } };
  expect(applyTrackingPosition(waiting, position)).toBe(waiting);
  if (view.fulfilment !== "delivery" || view.courier === null)
    throw new Error("Expected a courier");
  const active = {
    ...view,
    order: { ...view.order, status: "out_for_delivery" as const },
    courier: { ...view.courier, position: null },
  };
  const updated = applyTrackingPosition(active, position);
  expect(updated).toMatchObject({ courier: { position: { latitude: 36.77, heading: 90 } } });
  expect(applyTrackingPosition(updated, { ...position, longitude: 4 })).toBe(updated);
  expect(applyTrackingPosition(active, { ...position, orderId: crypto.randomUUID() })).toBe(active);
});

test("[CUS-18] the tracking map stays flat until the diner asks for the 3D street view", async () => {
  const { cameraPitch } = await import("../src/tracking/use-tracking-scene");
  expect(cameraPitch(false)).toBe(0);
  expect(cameraPitch(true)).toBe(55);
});
