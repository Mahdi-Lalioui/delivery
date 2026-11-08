import fc from "fast-check";
import { expect, test } from "vitest";
import { isOpenAt } from "../src/hours.ts";
import { getHoursPreview } from "../src/hours-preview.ts";
import { assertDomainProperty } from "./property.ts";

const minuteMs = 60_000;
const dayMs = 1440 * minuteMs;

function algiers(dateAndTime: string): number {
  return Date.parse(`${dateAndTime}+01:00`);
}

// 2027-02-08 is a Monday (weekday 1).
const mondayNoon = algiers("2027-02-08T12:00:00");
const split = [
  { opensMinute: 690, closesMinute: 900 },
  { opensMinute: 1080, closesMinute: 1410 },
];
const overnight = [{ opensMinute: 1080, closesMinute: 120 }];

test("[MER-15:preview] lists seven Algiers dates from the day containing `from`", () => {
  const preview = getHoursPreview({ hours: { weekly: {} }, from: algiers("2027-02-08T00:30:00") });
  expect(preview.map(({ date }) => date)).toEqual([
    "2027-02-08",
    "2027-02-09",
    "2027-02-10",
    "2027-02-11",
    "2027-02-12",
    "2027-02-13",
    "2027-02-14",
  ]);
  expect(preview.every(({ source, intervals }) => source === "weekly" && !intervals.length)).toBe(
    true,
  );
});

test("[MER-15:preview] shows split ranges and keeps an overnight range on its opening day", () => {
  const preview = getHoursPreview({
    hours: { weekly: { 1: split, 2: overnight } },
    from: mondayNoon,
  });
  expect(preview[0]?.intervals).toEqual([
    { opensAt: algiers("2027-02-08T11:30:00"), closesAt: algiers("2027-02-08T15:00:00") },
    { opensAt: algiers("2027-02-08T18:00:00"), closesAt: algiers("2027-02-08T23:30:00") },
  ]);
  expect(preview[1]?.intervals).toEqual([
    { opensAt: algiers("2027-02-09T18:00:00"), closesAt: algiers("2027-02-10T02:00:00") },
  ]);
});

test("[MER-15:preview] a special date replaces the week and cuts the previous night at midnight", () => {
  const hours = {
    weekly: { 1: overnight, 2: split },
    special: { "2027-02-09": [{ opensMinute: 600, closesMinute: 720 }] },
  };
  const [monday, tuesday] = getHoursPreview({ hours, from: mondayNoon });
  expect(monday?.intervals).toEqual([
    { opensAt: algiers("2027-02-08T18:00:00"), closesAt: algiers("2027-02-09T00:00:00") },
  ]);
  expect(tuesday).toEqual({
    date: "2027-02-09",
    source: "special",
    maghribAt: null,
    intervals: [
      { opensAt: algiers("2027-02-09T10:00:00"), closesAt: algiers("2027-02-09T12:00:00") },
    ],
  });
});

test("[MER-15:preview] the closed-now override trims and removes ranges before it ends", () => {
  const hours = { weekly: { 1: split }, pausedUntil: algiers("2027-02-08T19:00:00") };
  const [monday] = getHoursPreview({ hours, from: mondayNoon });
  expect(monday?.intervals).toEqual([
    { opensAt: algiers("2027-02-08T19:00:00"), closesAt: algiers("2027-02-08T23:30:00") },
  ]);
});

test("[MER-16:preview] resolves Ramadan days from Maghrib and adds the suhoor window", () => {
  const maghribAt = algiers("2027-02-08T18:23:00");
  const ramadan = {
    weekly: {
      1: [
        {
          opens: { kind: "maghrib", minutes: -60 },
          closes: { kind: "clock", minuteOfDay: 120 },
        } as const,
      ],
    },
    suhoor: { opensMinute: 180, closesMinute: 270 },
    maghribAtByDate: { "2027-02-08": maghribAt },
  };
  const [monday, tuesday] = getHoursPreview({
    hours: { weekly: { 1: split, 2: split } },
    ramadan,
    from: mondayNoon,
  });
  expect(monday).toEqual({
    date: "2027-02-08",
    source: "ramadan",
    maghribAt,
    intervals: [
      { opensAt: algiers("2027-02-08T03:00:00"), closesAt: algiers("2027-02-08T04:30:00") },
      { opensAt: algiers("2027-02-08T17:23:00"), closesAt: algiers("2027-02-09T02:00:00") },
    ],
  });
  expect(tuesday?.source).toBe("weekly");
});

test("[MER-16:preview] a special date still overrides a Ramadan day", () => {
  const preview = getHoursPreview({
    hours: { weekly: {}, special: { "2027-02-08": [] } },
    ramadan: {
      weekly: {},
      suhoor: { opensMinute: 180, closesMinute: 270 },
      maghribAtByDate: { "2027-02-08": algiers("2027-02-08T18:23:00") },
    },
    from: mondayNoon,
  });
  expect(preview[0]).toEqual({
    date: "2027-02-08",
    source: "special",
    maghribAt: null,
    intervals: [],
  });
});

test("[MER-15:preview] returns no days for an instant outside the calendar", () => {
  expect(getHoursPreview({ hours: { weekly: {} }, from: Number.NaN })).toEqual([]);
});

const rangeArbitrary = fc
  .record({
    opensMinute: fc.integer({ min: 0, max: 1439 }),
    closesMinute: fc.integer({ min: 0, max: 1440 }),
  })
  .filter(({ opensMinute, closesMinute }) => opensMinute !== closesMinute);
const dayArbitrary = fc.array(rangeArbitrary, { maxLength: 3 });

test("[MER-15:preview] covers exactly the instants the M1 open-now rule reports open", () => {
  const firstDay = algiers("2027-02-08T00:00:00");
  assertDomainProperty(
    fc.property(
      fc.record({
        week: fc.array(dayArbitrary, { minLength: 7, maxLength: 7 }),
        special: fc.dictionary(
          fc.constantFrom("2027-02-09", "2027-02-11", "2027-02-14", "2027-02-15"),
          dayArbitrary,
        ),
        pauseMinute: fc.option(fc.integer({ min: 0, max: 7 * 1440 }), { nil: undefined }),
        offsetMs: fc.integer({ min: dayMs, max: 7 * dayMs - 1 }),
      }),
      ({ week, special, pauseMinute, offsetMs }) => {
        const weekly = Object.fromEntries(week.map((ranges, weekday) => [weekday, ranges]));
        const hours = {
          weekly,
          special,
          ...(pauseMinute === undefined ? {} : { pausedUntil: firstDay + pauseMinute * minuteMs }),
        };
        const at = firstDay + offsetMs;
        const preview = getHoursPreview({ hours, from: firstDay });
        const isCovered = preview.some(({ intervals }) =>
          intervals.some(({ opensAt, closesAt }) => opensAt <= at && at < closesAt),
        );
        expect(isCovered).toBe(isOpenAt({ hours, at }));
      },
    ),
  );
});
