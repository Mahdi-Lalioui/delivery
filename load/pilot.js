/* global __ENV, open */

import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Counter, Rate } from "k6/metrics";
import { courierSample } from "./courier-sample.js";
import { requireLocalTarget } from "./local-target.js";

const placementRate = Number(__ENV.LOAD_PLACEMENT_RATE || 500);
const positionRate = Number(__ENV.LOAD_POSITION_RATE || 200);
const duration = __ENV.LOAD_DURATION || "1m";
const placementVus = Number(__ENV.LOAD_PLACEMENT_VUS || 800);
const positionVus = Number(__ENV.LOAD_POSITION_VUS || 400);
const positionDrivers = Number(__ENV.LOAD_POSITION_DRIVERS || 1000);
const baseUrl = (__ENV.LOAD_BASE_URL || "").replace(/\/$/u, "");
const origin = __ENV.LOAD_ORIGIN || baseUrl;
const fixturesPath = __ENV.LOAD_FIXTURES_FILE || "";
const fixturesJson = __ENV.LOAD_FIXTURES_JSON || "";
const placementSuccess = new Rate("placement_success");
const positionSuccess = new Rate("position_success");
const freshPlacements = new Counter("fresh_placements");
const acceptedPositions = new Counter("accepted_positions");

function durationSeconds(value) {
  const match = /^(\d+)(ms|s|m|h)$/u.exec(value);
  if (!match) throw new Error("LOAD_DURATION must be an integer followed by ms, s, m or h");
  const amount = Number(match[1]);
  const unit = match[2];
  return unit === "ms" ? amount / 1000 : amount * { s: 1, m: 60, h: 3600 }[unit];
}

function readFixtures() {
  if (fixturesJson) return JSON.parse(fixturesJson);
  if (fixturesPath) return JSON.parse(open(fixturesPath));
  throw new Error("Set LOAD_FIXTURES_JSON or LOAD_FIXTURES_FILE");
}

function requireText(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Fixture is missing ${label}`);
  }
}

function validatePlacementEntries(placements) {
  for (const placement of placements) {
    requireText(placement.sessionCookie, "placement sessionCookie");
    requireText(placement.quoteId, "placement quoteId");
  }
  if (new Set(placements.map((placement) => placement.quoteId)).size !== placements.length) {
    throw new Error("Every placement fixture must use a distinct quoteId");
  }
  const requiredPlacements = Math.ceil(placementRate * durationSeconds(duration)) + 1;
  if (placements.length < requiredPlacements) {
    throw new Error(
      `Need at least ${requiredPlacements} unique placement quote fixtures for this run`,
    );
  }
}

function validateCourierEntries(couriers) {
  for (const courier of couriers) {
    requireText(courier.sessionCookie, "courier sessionCookie");
    requireText(courier.orderId, "courier orderId");
    if (
      !Number.isFinite(courier.latitude) ||
      !Number.isFinite(courier.longitude) ||
      !Number.isFinite(courier.accuracyM)
    ) {
      throw new Error("Courier fixtures need finite latitude, longitude and accuracyM values");
    }
  }

  const courierAssignments = couriers.slice(0, positionDrivers);
  if (
    new Set(courierAssignments.map((courier) => courier.orderId)).size !== positionDrivers ||
    new Set(courierAssignments.map((courier) => courier.sessionCookie)).size !== positionDrivers
  ) {
    throw new Error("Courier fixtures need distinct sessions and order assignments");
  }
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function validateRateSettings() {
  requirePositiveInteger(placementRate, "LOAD_PLACEMENT_RATE");
  requirePositiveInteger(positionRate, "LOAD_POSITION_RATE");
  requirePositiveInteger(placementVus, "LOAD_PLACEMENT_VUS");
  requirePositiveInteger(positionVus, "LOAD_POSITION_VUS");
  if (!Number.isInteger(positionDrivers) || positionDrivers < 1000) {
    throw new Error("LOAD_POSITION_DRIVERS must be an integer of at least 1,000");
  }
}

requireLocalTarget(baseUrl, origin);
validateRateSettings();

// Validate each fixture pool once when k6 initializes its shared data.
const placements = new SharedArray("placement fixtures", () => {
  const { placements } = readFixtures();
  if (!Array.isArray(placements) || placements.length === 0) {
    throw new Error("Fixtures need a non-empty placements array");
  }
  validatePlacementEntries(placements);
  return placements;
});

const couriers = new SharedArray("courier fixtures", () => {
  const { couriers } = readFixtures();
  if (!Array.isArray(couriers) || couriers.length < positionDrivers) {
    throw new Error("Fixtures need at least 1,000 distinct courier/order assignments");
  }
  validateCourierEntries(couriers);
  return couriers;
});

export const options = {
  maxRedirects: 0,
  scenarios: {
    placement: {
      executor: "constant-arrival-rate",
      exec: "placeOrder",
      rate: placementRate,
      timeUnit: "1s",
      duration,
      preAllocatedVUs: placementVus,
      maxVUs: placementVus,
    },
    positions: {
      executor: "constant-arrival-rate",
      exec: "sendPosition",
      rate: positionRate,
      timeUnit: "1s",
      duration,
      preAllocatedVUs: positionVus,
      maxVUs: positionVus,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    dropped_iterations: ["count==0"],
    "http_req_duration{scenario:placement}": ["p(95)<400"],
    "http_req_duration{scenario:positions}": ["p(95)<400"],
    placement_success: ["rate>0.99"],
    fresh_placements: [`count>=${Math.ceil(placementRate * durationSeconds(duration))}`],
    position_success: ["rate>0.99"],
  },
};

function requestHeaders(sessionCookie) {
  return {
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
      Origin: origin,
    },
    redirects: 0,
    tags: { endpoint: "order-placement" },
  };
}

export function placeOrder() {
  const iteration = exec.scenario.iterationInTest;
  const fixture = placements[iteration];
  if (!fixture) {
    placementSuccess.add(false);
    exec.test.abort("Placement fixture pool exhausted");
    return;
  }
  const payload = {
    quoteId: fixture.quoteId,
    ...(fixture.payingWithDzd === undefined ? {} : { payingWithDzd: fixture.payingWithDzd }),
    ...(fixture.contactPhone === undefined ? {} : { contactPhone: fixture.contactPhone }),
  };
  const response = http.post(`${baseUrl}/v1/orders`, JSON.stringify(payload), {
    ...requestHeaders(fixture.sessionCookie),
    headers: {
      ...requestHeaders(fixture.sessionCookie).headers,
      "Idempotency-Key": `load-${Date.now()}-${iteration}`,
    },
  });
  const created = check(response, { "fresh order created": (result) => result.status === 201 });
  placementSuccess.add(created);
  if (created) freshPlacements.add(1);
}

export function sendPosition() {
  const iteration = exec.scenario.iterationInTest;
  const courier = couriers[iteration % positionDrivers];
  const position = courierSample(courier, {
    iteration,
    drivers: positionDrivers,
    rate: positionRate,
    startTime: exec.scenario.startTime,
  });
  const response = http.post(
    `${baseUrl}/v1/courier/positions`,
    JSON.stringify({ orderId: courier.orderId, positions: [position] }),
    { ...requestHeaders(courier.sessionCookie), tags: { endpoint: "courier-positions" } },
  );
  const accepted = check(response, {
    "courier position accepted": (result) => {
      if (result.status !== 200) return false;
      try {
        return result.json("accepted") === 1;
      } catch {
        return false;
      }
    },
  });
  positionSuccess.add(accepted);
  if (accepted) acceptedPositions.add(1);
}
