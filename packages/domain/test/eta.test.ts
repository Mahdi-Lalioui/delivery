import { expect, test } from "vitest";
import { estimateDelivery, isTrackingEtaDue } from "../src/eta.ts";

test("[GEO-04:domain] ETA adds three minutes before rounding its range endpoints", () => {
  expect(estimateDelivery({ prepMinutes: 13, travelMinutes: 7 })).toEqual({
    ok: true,
    value: { earliestMinutes: 20, latestMinutes: 30 },
  });
  expect(estimateDelivery({ prepMinutes: 15, travelMinutes: 7.5 })).toEqual({
    ok: true,
    value: { earliestMinutes: 25, latestMinutes: 30 },
  });
  expect(estimateDelivery({ prepMinutes: 0, travelMinutes: 0 })).toEqual({
    ok: true,
    value: { earliestMinutes: 0, latestMinutes: 10 },
  });
});

test.each([
  { prepMinutes: -1, travelMinutes: 5 },
  { prepMinutes: 5, travelMinutes: -1 },
  { prepMinutes: Number.NaN, travelMinutes: 5 },
  { prepMinutes: 5, travelMinutes: Number.POSITIVE_INFINITY },
  { prepMinutes: Number.MAX_SAFE_INTEGER, travelMinutes: 5 },
  { prepMinutes: 5, travelMinutes: Number.MAX_SAFE_INTEGER },
])("[GEO-04:domain] rejects invalid durations %j", (durations) => {
  expect(estimateDelivery(durations)).toEqual({ ok: false, error: { code: "invalid_eta" } });
});

test("[GEO-04:domain] tracking ETA recomputes at most once per thirty seconds", () => {
  expect(isTrackingEtaDue({ now: 100_000, lastComputedAt: null })).toBe(true);
  expect(isTrackingEtaDue({ now: 100_000, lastComputedAt: 70_001 })).toBe(false);
  expect(isTrackingEtaDue({ now: 100_000, lastComputedAt: 70_000 })).toBe(true);
  expect(isTrackingEtaDue({ now: 100_000, lastComputedAt: 69_999 })).toBe(true);
  expect(isTrackingEtaDue({ now: 100_000, lastComputedAt: 110_000 })).toBe(false);
  expect(isTrackingEtaDue({ now: -1, lastComputedAt: null })).toBe(false);
  expect(isTrackingEtaDue({ now: 100_000, lastComputedAt: -1 })).toBe(false);
});
