import fc from "fast-check";
import { expect, test } from "vitest";
import { getScheduledSlots, isOpenAt } from "../src/hours.ts";
import { assertDomainProperty } from "./property.ts";

const minuteMs = 60_000;
const mondayStart = Date.parse("2027-02-08T00:00:00+01:00");
const monday = [
  { opensMinute: 690, closesMinute: 900 },
  { opensMinute: 1080, closesMinute: 1410 },
];
const overnight = [{ opensMinute: 1080, closesMinute: 120 }];
const allDay = [{ opensMinute: 0, closesMinute: 1440 }];

function algiers(dateAndTime: string): number {
  return Date.parse(`${dateAndTime}+01:00`);
}

test("[HRS-01] opens at the Algiers local start and closes at the end of each range", () => {
  const hours = { weekly: { 1: monday } };
  expect(isOpenAt({ hours, at: algiers("2027-02-08T11:29:59.999") })).toBe(false);
  expect(isOpenAt({ hours, at: algiers("2027-02-08T11:30:00") })).toBe(true);
  expect(isOpenAt({ hours, at: algiers("2027-02-08T15:00:00") })).toBe(false);
  expect(isOpenAt({ hours, at: algiers("2027-02-08T18:00:00") })).toBe(true);
  expect(isOpenAt({ hours, at: algiers("2027-02-09T18:00:00") })).toBe(false);
});

test("[HRS-01:overnight] resolves the previous local day after midnight", () => {
  const hours = { weekly: { 1: overnight } };
  expect(isOpenAt({ hours, at: algiers("2027-02-08T23:59:59.999") })).toBe(true);
  expect(isOpenAt({ hours, at: algiers("2027-02-09T00:00:00") })).toBe(true);
  expect(isOpenAt({ hours, at: algiers("2027-02-09T01:59:59.999") })).toBe(true);
  expect(isOpenAt({ hours, at: algiers("2027-02-09T02:00:00") })).toBe(false);
});

test("[HRS-01:special] a special closure suppresses current ranges and prior overnight hours", () => {
  const hours = { weekly: { 1: overnight, 2: allDay }, special: { "2027-02-09": [] } };
  expect(isOpenAt({ hours, at: algiers("2027-02-08T23:59:59.999") })).toBe(true);
  expect(isOpenAt({ hours, at: algiers("2027-02-09T00:00:00") })).toBe(false);
  expect(isOpenAt({ hours, at: algiers("2027-02-09T12:00:00") })).toBe(false);
});

test("[HRS-01:special] special hours replace weekly hours and can continue into the next day", () => {
  const hours = { weekly: { 1: allDay }, special: { "2027-02-08": overnight } };
  expect(isOpenAt({ hours, at: algiers("2027-02-08T12:00:00") })).toBe(false);
  expect(isOpenAt({ hours, at: algiers("2027-02-08T19:00:00") })).toBe(true);
  expect(isOpenAt({ hours, at: algiers("2027-02-09T01:00:00") })).toBe(true);
});

test("[HRS-01:busy] a busy override expires at its exact instant", () => {
  const until = algiers("2027-02-08T13:00:00");
  const hours = { weekly: {}, special: { "2027-02-08": allDay }, pausedUntil: until };
  expect(isOpenAt({ hours, at: until - 1 })).toBe(false);
  expect(isOpenAt({ hours, at: until })).toBe(true);
});

test.each([
  { opensMinute: -1, closesMinute: 600 },
  { opensMinute: 1440, closesMinute: 500 },
  { opensMinute: 1.5, closesMinute: 600 },
  { opensMinute: 0, closesMinute: 1441 },
  { opensMinute: 600, closesMinute: -1 },
  { opensMinute: 0, closesMinute: 600.5 },
  { opensMinute: 480, closesMinute: 480 },
])("[HRS-01:input] ignores invalid opening range %j", (range) => {
  const hours = { weekly: { 0: [range], 1: [range] } };
  expect(isOpenAt({ hours, at: algiers("2027-02-08T00:00:00") })).toBe(false);
  expect(isOpenAt({ hours, at: algiers("2027-02-08T09:00:00") })).toBe(false);
});

test("[HRS-01:input] invalid instants are closed", () => {
  const hours = { weekly: { 1: allDay } };
  expect(isOpenAt({ hours, at: Number.NaN })).toBe(false);
  expect(isOpenAt({ hours, at: -1 })).toBe(false);
  expect(isOpenAt({ hours, at: Number.MAX_SAFE_INTEGER })).toBe(false);
});

test("[HRS-01:edges] preserves open and close bounds across midnight @property", () => {
  assertDomainProperty(
    fc.property(
      fc.integer({ min: 1080, max: 1439 }),
      fc.integer({ min: 1, max: 180 }),
      (open, close) => {
        const hours = { weekly: { 1: [{ opensMinute: open, closesMinute: close }] } };
        const opensAt = mondayStart + open * minuteMs;
        const midnight = mondayStart + 1440 * minuteMs;
        const closesAt = midnight + close * minuteMs;
        expect(isOpenAt({ hours, at: opensAt - 1 })).toBe(false);
        expect(isOpenAt({ hours, at: opensAt })).toBe(true);
        expect(isOpenAt({ hours, at: midnight - 1 })).toBe(true);
        expect(isOpenAt({ hours, at: midnight })).toBe(true);
        expect(isOpenAt({ hours, at: closesAt - 1 })).toBe(true);
        expect(isOpenAt({ hours, at: closesAt })).toBe(false);
      },
    ),
  );
});

test("[HRS-02] rounds up prep plus travel and leaves the prep buffer before close", () => {
  const hours = { weekly: { 1: [{ opensMinute: 660, closesMinute: 720 }] } };
  const now = algiers("2027-02-08T10:58:00");
  const slots = getScheduledSlots({ hours, now, prepMinutes: 15, travelMinutes: 2.5 });
  expect(slots).toEqual([algiers("2027-02-08T11:30:00"), algiers("2027-02-08T11:45:00")]);
});

test("[HRS-02:horizon] includes the exact three-day horizon and no later slot", () => {
  const hours = { weekly: { 1: allDay, 2: allDay, 3: allDay, 4: allDay } };
  const now = algiers("2027-02-08T11:00:00");
  const slots = getScheduledSlots({ hours, now, prepMinutes: 0, travelMinutes: 0 });
  expect(slots).toHaveLength(288);
  expect(slots[0]).toBe(algiers("2027-02-08T11:15:00"));
  expect(slots.every((slot) => slot > now)).toBe(true);
  expect(slots.at(-1)).toBe(algiers("2027-02-11T11:00:00"));
});

test("[HRS-02:overnight] leaves prep time across midnight when overnight service continues", () => {
  const hours = { weekly: { 1: overnight } };
  const now = algiers("2027-02-08T23:10:00");
  const slots = getScheduledSlots({ hours, now, prepMinutes: 30, travelMinutes: 0 });
  expect(slots).toEqual([
    algiers("2027-02-08T23:45:00"),
    algiers("2027-02-09T00:00:00"),
    algiers("2027-02-09T00:15:00"),
    algiers("2027-02-09T00:30:00"),
    algiers("2027-02-09T00:45:00"),
    algiers("2027-02-09T01:00:00"),
    algiers("2027-02-09T01:15:00"),
    algiers("2027-02-09T01:30:00"),
  ]);
  expect(
    getScheduledSlots({
      hours: { ...hours, special: { "2027-02-09": [] } },
      now,
      prepMinutes: 30,
      travelMinutes: 0,
    }),
  ).toEqual([]);
});

test("[HRS-02:busy] excludes slots during a pause and at the closing instant", () => {
  const hours = {
    weekly: { 1: [{ opensMinute: 660, closesMinute: 720 }] },
    pausedUntil: algiers("2027-02-08T11:30:00"),
  };
  const now = algiers("2027-02-08T11:00:00");
  expect(getScheduledSlots({ hours, now, prepMinutes: 0, travelMinutes: 0 })).toEqual([
    algiers("2027-02-08T11:30:00"),
    algiers("2027-02-08T11:45:00"),
  ]);
});

test("[HRS-02:ranges] merges touching and overlapping ranges but keeps closed gaps", () => {
  const hours = {
    weekly: {
      1: [
        { opensMinute: 720, closesMinute: 780 },
        { opensMinute: 660, closesMinute: 720 },
        { opensMinute: 765, closesMinute: 795 },
        { opensMinute: 825, closesMinute: 855 },
      ],
    },
  };
  const now = algiers("2027-02-08T11:15:00");
  const slots = getScheduledSlots({ hours, now, prepMinutes: 30, travelMinutes: 0 });
  expect(slots).toEqual([
    algiers("2027-02-08T11:45:00"),
    algiers("2027-02-08T12:00:00"),
    algiers("2027-02-08T12:15:00"),
    algiers("2027-02-08T12:30:00"),
    algiers("2027-02-08T12:45:00"),
    algiers("2027-02-08T13:45:00"),
  ]);
});

test.each([
  { now: Number.NaN, prepMinutes: 0, travelMinutes: 0 },
  { now: mondayStart, prepMinutes: -1, travelMinutes: 0 },
  { now: mondayStart, prepMinutes: 0, travelMinutes: Number.POSITIVE_INFINITY },
  { now: mondayStart, prepMinutes: 5000, travelMinutes: 0 },
  { now: 8_639_999_990_000_000, prepMinutes: 0, travelMinutes: 0 },
])("[HRS-02:input] gives no slots for an unusable request %j", (input) => {
  expect(getScheduledSlots({ hours: { weekly: { 1: allDay } }, ...input })).toEqual([]);
});

test("[HRS-01:input] excludes historical instants outside the supported Algiers calendar", () => {
  const historicalMonday = Date.parse("1977-01-03T10:30:00Z");
  const hours = { weekly: { 1: [{ opensMinute: 660, closesMinute: 720 }] } };
  expect(isOpenAt({ hours, at: historicalMonday })).toBe(false);
  expect(
    getScheduledSlots({ hours, now: historicalMonday, prepMinutes: 5, travelMinutes: 0 }),
  ).toEqual([]);
});
