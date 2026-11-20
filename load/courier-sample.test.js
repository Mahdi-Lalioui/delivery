import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptedCourierPositions } from "../packages/db/src/courier-position-validation.ts";
import { courierSample } from "./courier-sample.js";

const startTime = Date.parse("2026-11-20T10:00:00Z");
const courier = { latitude: 36.75, longitude: 3.06, accuracyM: 10, heading: 45 };

void test("[NFR-03] each courier's twelve scheduled samples pass position intake with arrival jitter", () => {
  const accepted = [];
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const iteration = 713 + i * 1000;
    const nominal = startTime + iteration * 5;
    const now = nominal + (i % 2 === 0 ? -100 : 400);
    const point = courierSample(courier, { iteration, drivers: 1000, rate: 200, startTime });
    samples.push(point);
    accepted.push(
      ...acceptedCourierPositions([point], accepted.at(-1), {
        now,
        startedAt: startTime - 60_000,
      }),
    );
  }
  assert.equal(accepted.length, 12);
  for (const [i, point] of samples.entries()) {
    assert.equal(Date.parse(point.capturedAt) - Date.parse(samples[0].capturedAt), i * 5000);
    const northMetres = (point.latitude - courier.latitude) * 111_320;
    const eastMetres = (point.longitude - courier.longitude) * 89_200;
    assert.ok(Math.hypot(northMetres, eastMetres) <= 155, "courier stays on its fixture street");
  }
});
