import { expect, test } from "vitest";
import { calculateMaghrib } from "../src/maghrib.ts";
import reference from "./fixtures/algiers-maghrib-2027.json" with { type: "json" };

const coordinates = reference.coordinates;
const minuteMs = 60_000;

function expectInstant(instant: number | null): number {
  if (instant === null) throw new Error("Expected a Maghrib instant");
  return instant;
}

test("[HRS-03:astronomy] matches the independent Algiers reference across 59 days", () => {
  const days = Object.entries(reference.maghrib);
  expect(days).toHaveLength(59);
  for (const [date, localTime] of days) {
    const expected = Date.parse(`${date}T${localTime}:00${reference.utcOffset}`);
    const actual = expectInstant(calculateMaghrib({ date, coordinates }));
    // Both ephemerides round to minutes independently.
    expect(Math.abs(actual - expected), `${date} Maghrib`).toBeLessThanOrEqual(minuteMs);
  }
});

test("[HRS-03:astronomy] uses the supplied location on the same civil date", () => {
  const date = "2027-03-05";
  const western = expectInstant(
    calculateMaghrib({ date, coordinates: { latitude: 36.7538, longitude: 2.85 } }),
  );
  const eastern = expectInstant(
    calculateMaghrib({ date, coordinates: { latitude: 36.7538, longitude: 3.25 } }),
  );
  expect(western).toBeGreaterThan(eastern);
});

test.each([-7, 8])("[HRS-03:astronomy] applies a manual offset of %i minutes", (offset) => {
  const input = { date: "2027-03-05", coordinates };
  const base = expectInstant(calculateMaghrib(input));
  const adjusted = calculateMaghrib({ ...input, adjustmentMinutes: offset });
  expect(adjusted).toBe(base + offset * minuteMs);
});

test("[HRS-03:astronomy] accepts a configurable prayer method", () => {
  const input = { date: "2027-03-05", coordinates };
  const base = expectInstant(calculateMaghrib(input));
  const turkish = calculateMaghrib({ ...input, method: "Turkey" });
  expect(turkish).toBe(base + 4 * minuteMs);
});

test.each(["2027-02-29", "2027-04-31", "2027-2-08", "2027-13-01", "2027-02-08T00:00:00Z"])(
  "[HRS-03:astronomy] rejects invalid civil date %s",
  (date) => {
    expect(calculateMaghrib({ date, coordinates })).toBeNull();
  },
);

test("[HRS-03:astronomy] accepts a valid leap day", () => {
  expect(calculateMaghrib({ date: "2028-02-29", coordinates })).not.toBeNull();
});

test.each([
  { latitude: -91, longitude: 0 },
  { latitude: 0, longitude: 181 },
  { latitude: 0, longitude: Number.NaN },
  { latitude: Number.POSITIVE_INFINITY, longitude: 0 },
])("[HRS-03:astronomy] rejects invalid coordinates %j", (invalid) => {
  expect(calculateMaghrib({ date: "2027-02-08", coordinates: invalid })).toBeNull();
});

test.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
  "[HRS-03:astronomy] rejects an unusable adjustment %s",
  (adjustmentMinutes) => {
    expect(calculateMaghrib({ date: "2027-02-08", coordinates, adjustmentMinutes })).toBeNull();
  },
);
