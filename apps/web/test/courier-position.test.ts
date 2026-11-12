import { expect, test } from "vitest";
import { courierGpsFix, isNewCourierPosition } from "../src/courier/courier-position";

const timestamp = Date.parse("2026-11-11T12:00:00Z");
const coordinates = { latitude: 36.75, longitude: 3.0625, accuracy: 10, heading: null };

test("[COU-04] drops low-accuracy fixes and normalizes optional bearing", () => {
  expect(courierGpsFix({ ...coordinates, accuracy: 101 }, timestamp)).toBeUndefined();
  expect(courierGpsFix(coordinates, timestamp)).toEqual({
    latitude: 36.75,
    longitude: 3.0625,
    accuracyM: 10,
    capturedAt: "2026-11-11T12:00:00.000Z",
  });
  expect(courierGpsFix({ ...coordinates, heading: 45 }, timestamp)?.heading).toBe(45);
});

test("[COU-04] waits for both five seconds and twenty metres before queuing a new point", () => {
  const prior = courierGpsFix(coordinates, timestamp);
  const next = (latitude: number, delay: number) =>
    courierGpsFix({ ...coordinates, latitude }, timestamp + delay);
  expect(isNewCourierPosition(next(36.7503, 4_999), prior)).toBe(false);
  expect(isNewCourierPosition(next(36.7501, 5_000), prior)).toBe(false);
  expect(isNewCourierPosition(next(36.7503, 5_000), prior)).toBe(true);
});
