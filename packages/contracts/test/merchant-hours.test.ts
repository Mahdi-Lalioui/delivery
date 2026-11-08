import { expect, test } from "vitest";
import {
  merchantHoursCommandInput,
  merchantHoursInput,
  merchantHoursOutput,
  merchantHoursPauseInput,
  merchantHoursPauseOutput,
  merchantHoursPreviewOutput,
  merchantHoursPreviewQuery,
  merchantHoursWriteOutput,
  merchantRamadanCommandInput,
  merchantRamadanInput,
  merchantRamadanOutput,
} from "../src/merchant-hours.ts";

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

test("[MER-15:contract] accepts positive Gregorian years and leap days", () => {
  const specialDates = ["0001-01-01", "2028-02-29", "9999-12-31"].map((date) => ({
    date,
    ranges: [],
  }));
  expect(merchantHoursInput.parse({ weekly: week(), specialDates }).specialDates).toEqual(
    specialDates,
  );
});

test.each([
  ["year zero", { weekly: week(), specialDates: [{ date: "0000-01-01", ranges: [] }] }],
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

test("[MER-15:contract] binds a hours replace to a menu revision and reads back the session", () => {
  const hours = { weekly: week([[lunch, dinner]]), specialDates: [] };
  const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
  expect(merchantHoursCommandInput.parse({ ...hours, expectedRevision: 3 })).toEqual({
    ...hours,
    expectedRevision: 3,
  });
  expect(merchantHoursCommandInput.safeParse(hours).success).toBe(false);
  expect(merchantHoursCommandInput.safeParse({ ...hours, expectedRevision: -1 }).success).toBe(
    false,
  );
  expect(merchantHoursOutput.parse({ ...hours, sessionId, revision: 3 })).toEqual({
    ...hours,
    sessionId,
    revision: 3,
  });
  expect(merchantHoursWriteOutput.parse({ revision: 4 })).toEqual({ revision: 4 });
  expect(merchantHoursWriteOutput.safeParse({ revision: 4, extra: true }).success).toBe(false);
});

test("[MER-16:contract] binds a Ramadan replace to a revision and reads a missing schedule as null", () => {
  const schedule = {
    weekly: week().map((day) => ({
      weekday: day.weekday,
      ranges: [
        { opens: { kind: "maghrib", minutes: -60 }, closes: { kind: "clock", minuteOfDay: 120 } },
      ],
    })),
    suhoor: null,
    method: "Algeria",
    adjustmentMinutes: 0,
  };
  const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
  expect(merchantRamadanCommandInput.parse({ ...schedule, expectedRevision: 2 })).toEqual({
    ...schedule,
    expectedRevision: 2,
  });
  expect(merchantRamadanCommandInput.safeParse(schedule).success).toBe(false);
  expect(merchantRamadanOutput.parse({ sessionId, revision: 0, schedule: null })).toEqual({
    sessionId,
    revision: 0,
    schedule: null,
  });
  expect(merchantRamadanOutput.parse({ sessionId, revision: 2, schedule }).schedule).toEqual(
    schedule,
  );
});

test("[MER-15:contract] closes until an exact instant or reopens with null", () => {
  const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
  const until = "2026-11-08T05:00:00.000Z";
  expect(merchantHoursPauseInput.parse({ pausedUntil: until, expectedRevision: 1 })).toEqual({
    pausedUntil: until,
    expectedRevision: 1,
  });
  expect(
    merchantHoursPauseInput.parse({ pausedUntil: null, expectedRevision: 1 }).pausedUntil,
  ).toBe(null);
  expect(
    merchantHoursPauseInput.safeParse({ pausedUntil: "2026-11-08", expectedRevision: 1 }).success,
  ).toBe(false);
  expect(merchantHoursPauseInput.safeParse({ expectedRevision: 1 }).success).toBe(false);
  expect(merchantHoursPauseOutput.parse({ sessionId, revision: 1, pausedUntil: null })).toEqual({
    sessionId,
    revision: 1,
    pausedUntil: null,
  });
});

test("[MER-16:contract] previews seven dated days of instants for either schedule", () => {
  expect(merchantHoursPreviewQuery.parse({ schedule: "ramadan" })).toEqual({ schedule: "ramadan" });
  expect(merchantHoursPreviewQuery.safeParse({ schedule: "summer" }).success).toBe(false);
  expect(merchantHoursPreviewQuery.safeParse({}).success).toBe(false);

  const day = {
    date: "2027-02-08",
    source: "ramadan",
    maghribAt: "2027-02-08T17:23:00.000Z",
    intervals: [{ opensAt: "2027-02-08T16:23:00.000Z", closesAt: "2027-02-09T01:00:00.000Z" }],
  };
  const output = { schedule: "ramadan", days: Array.from({ length: 7 }, () => day) };
  expect(merchantHoursPreviewOutput.parse(output)).toEqual(output);
  expect(merchantHoursPreviewOutput.safeParse({ ...output, days: [day] }).success).toBe(false);
  const unknownSource = { ...output, days: output.days.map((d) => ({ ...d, source: "busy" })) };
  expect(merchantHoursPreviewOutput.safeParse(unknownSource).success).toBe(false);
});
