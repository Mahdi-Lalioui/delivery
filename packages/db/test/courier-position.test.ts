import { expect, test } from "vitest";
import { acceptedCourierPositions } from "../src/courier-position-validation.ts";

const now = Date.parse("2026-11-11T12:00:00Z");
const startedAt = now - 180_000;
const pin = { latitude: 36.75, longitude: 3.0625 };
const sample = (offset: number, latitude = pin.latitude) => ({
  ...pin,
  latitude,
  accuracyM: 10,
  capturedAt: new Date(now + offset).toISOString(),
});

test("[GEO-06] drops points outside Algeria, before pickup, stale or ahead of server time", () => {
  const first = sample(-30_000);
  expect(
    acceptedCourierPositions(
      [
        { ...sample(-50_000), longitude: 25 },
        sample(-121_000),
        sample(-180_001),
        sample(1),
        { ...first, accuracyM: 101 },
        first,
      ],
      undefined,
      { now, startedAt },
    ),
  ).toEqual([first]);
});

test("[GEO-06] keeps only ordered samples spaced by five seconds and twenty metres at plausible speeds", () => {
  const prior = sample(-30_000);
  const next = sample(-20_000, 36.7503);
  const last = sample(-10_000, 36.7506);
  expect(
    acceptedCourierPositions(
      [
        last,
        sample(-29_000, 36.7503),
        sample(-25_000, 36.75001),
        sample(-24_000, 36.8),
        prior,
        next,
        next,
      ],
      prior,
      { now, startedAt },
    ),
  ).toEqual([next, last]);
});
