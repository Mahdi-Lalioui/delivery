import { expect, test } from "vitest";
import { merchantHoursInput, merchantRamadanInput } from "../src/merchant-hours.ts";

const lunch = { opensMinute: 690, closesMinute: 900 };
const dinner = { opensMinute: 1080, closesMinute: 1410 };
const lateNight = { opensMinute: 1080, closesMinute: 120 };

function week(ranges: (typeof lunch)[][] = []) {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: ranges[weekday] ?? [] }));
}

test("[MER-15:contract] accepts several ranges a day and a range across midnight", () => {
  const input = {
    weekly: week([[lunch, dinner], [lateNight], [{ opensMinute: 0, closesMinute: 1440 }]]),
    specialDates: [
      { date: "2026-11-01", ranges: [] },
      { date: "2026-12-31", ranges: [lunch] },
    ],
  };
  expect(merchantHoursInput.parse(input)).toEqual(input);
});

test.each([
  ["a missing weekday", { weekly: week().slice(0, 6), specialDates: [] }],
  [
    "a repeated weekday",
    { weekly: [...week().slice(0, 6), { weekday: 0, ranges: [] }], specialDates: [] },
  ],
  [
    "an empty range",
    { weekly: week([[{ opensMinute: 600, closesMinute: 600 }]]), specialDates: [] },
  ],
  [
    "a minute off the clock",
    { weekly: week([[{ opensMinute: 1440, closesMinute: 60 }]]), specialDates: [] },
  ],
  [
    "a fractional minute",
    { weekly: week([[{ opensMinute: 600.5, closesMinute: 900 }]]), specialDates: [] },
  ],
  [
    "overlapping ranges on one day",
    { weekly: week([[lunch, { opensMinute: 840, closesMinute: 1000 }]]), specialDates: [] },
  ],
  [
    "an overnight range overlapping a later one",
    { weekly: week([[dinner, { opensMinute: 1380, closesMinute: 60 }]]), specialDates: [] },
  ],
  ["too many ranges a day", { weekly: week([[1, 2, 3, 4, 5].map(rangeAt)]), specialDates: [] }],
  [
    "a repeated special date",
    {
      weekly: week(),
      specialDates: [
        { date: "2026-11-01", ranges: [] },
        { date: "2026-11-01", ranges: [lunch] },
      ],
    },
  ],
  ["an impossible date", { weekly: week(), specialDates: [{ date: "2026-02-30", ranges: [] }] }],
])("[MER-15:contract] rejects %s", (_reason, input) => {
  expect(merchantHoursInput.safeParse(input).success).toBe(false);
});

function rangeAt(hour: number) {
  return { opensMinute: hour * 120, closesMinute: hour * 120 + 60 };
}

const iftarToLate = {
  opens: { kind: "maghrib", minutes: -60 },
  closes: { kind: "clock", minuteOfDay: 120 },
} as const;

function ramadanWeek(ranges: object[][] = []) {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: ranges[weekday] ?? [] }));
}

test("[MER-16:contract] accepts Maghrib-relative days, a suhoor window, a method and an offset", () => {
  const input = {
    weekly: ramadanWeek([[iftarToLate], [iftarToLate]]),
    suhoor: { opensMinute: 0, closesMinute: 240 },
    method: "Algeria",
    adjustmentMinutes: -2,
  };
  expect(merchantRamadanInput.parse(input)).toEqual(input);
  expect(merchantRamadanInput.parse({ ...input, suhoor: null, method: "UmmAlQura" })).toMatchObject(
    { suhoor: null, method: "UmmAlQura" },
  );
});

test.each([
  ["an unknown method", { method: "Other" }],
  ["an offset beyond thirty minutes", { adjustmentMinutes: 31 }],
  ["a fractional offset", { adjustmentMinutes: 1.5 }],
  [
    "a Maghrib offset beyond twelve hours",
    {
      weekly: ramadanWeek([[{ ...iftarToLate, opens: { kind: "maghrib", minutes: -721 } }]]),
    },
  ],
  [
    "a clock minute off the day",
    {
      weekly: ramadanWeek([[{ ...iftarToLate, closes: { kind: "clock", minuteOfDay: 1440 } }]]),
    },
  ],
  ["a missing weekday", { weekly: ramadanWeek().slice(0, 6) }],
  ["an empty suhoor window", { suhoor: { opensMinute: 60, closesMinute: 60 } }],
])("[MER-16:contract] rejects %s", (_reason, override) => {
  const base = { weekly: ramadanWeek(), suhoor: null, method: "Algeria", adjustmentMinutes: 0 };
  expect(merchantRamadanInput.safeParse({ ...base, ...override }).success).toBe(false);
});
