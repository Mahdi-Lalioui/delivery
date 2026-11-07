import { expect, test } from "vitest";
import { merchantHoursInput } from "../src/merchant-hours.ts";

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
