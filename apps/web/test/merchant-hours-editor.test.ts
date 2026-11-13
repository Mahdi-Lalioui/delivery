import { expect, test } from "vitest";
import { formatClock, isOvernightRange, parseClock } from "../src/merchant-hours/clock-ranges";
import {
  addHoursRange,
  canAddHoursRange,
  removeHoursRange,
  toHoursDraft,
  toHoursInput,
  updateHoursRange,
  type HoursDraft,
} from "../src/merchant-hours/hours-editor";

const emptyWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] }));
const stored = {
  weekly: emptyWeek.map((day) =>
    day.weekday === 1
      ? {
          weekday: 1,
          ranges: [
            { opensMinute: 690, closesMinute: 900 },
            { opensMinute: 1080, closesMinute: 120 },
          ],
        }
      : day,
  ),
  specialDates: [{ date: "2026-12-31", ranges: [] }],
};

function draftWith(ranges: { opens: string; closes: string }[]): HoursDraft {
  const draft = toHoursDraft({ weekly: emptyWeek, specialDates: [] });
  return {
    ...draft,
    weekly: draft.weekly.map((day) => (day.weekday === 2 ? { ...day, ranges } : day)),
  };
}

test.each([
  ["00:00", 0],
  ["11:30", 690],
  ["23:59", 1439],
  ["٠٢:٣٠", 150],
])("[MER-15] reads the clock text %s as minute %i", (text, minute) => {
  expect(parseClock(text)).toBe(minute);
});

test.each(["", "24:00", "7:5", "12:60", "noon"])("[MER-15] rejects the clock text %j", (text) => {
  expect(parseClock(text)).toBeUndefined();
});

test("[MER-15] formats minutes as 24-hour clock text with midnight as 00:00", () => {
  expect([0, 690, 1439, 1440].map(formatClock)).toEqual(["00:00", "11:30", "23:59", "00:00"]);
});

test("[MER-15] round-trips stored hours and keeps the special dates", () => {
  const draft = toHoursDraft(stored);
  expect(draft.weekly[1]?.ranges).toEqual([
    { opens: "11:30", closes: "15:00" },
    { opens: "18:00", closes: "02:00" },
  ]);
  expect(draft.specialDates).toEqual([{ date: "2026-12-31", ranges: [] }]);
  expect(toHoursInput(draft)).toEqual({ kind: "valid", input: stored });
});

test("[MER-15] marks a range that closes at or before it opens as overnight", () => {
  expect(isOvernightRange({ opens: "18:00", closes: "02:00" })).toBe(true);
  expect(isOvernightRange({ opens: "18:00", closes: "23:30" })).toBe(false);
  expect(isOvernightRange({ opens: "18:00", closes: "00:00" })).toBe(false);
  expect(isOvernightRange({ opens: "18:00", closes: "" })).toBe(false);
});

test("[MER-15] saves a closing time of 00:00 as the end of the day", () => {
  const result = toHoursInput(draftWith([{ opens: "18:00", closes: "00:00" }]));
  expect(result.kind === "valid" && result.input.weekly[2]?.ranges).toEqual([
    { opensMinute: 1080, closesMinute: 1440 },
  ]);
  const allDay = toHoursInput(draftWith([{ opens: "00:00", closes: "00:00" }]));
  expect(allDay.kind === "valid" && allDay.input.weekly[2]?.ranges).toEqual([
    { opensMinute: 0, closesMinute: 1440 },
  ]);
});

test("[MER-15] reports unreadable or empty times and overlapping ranges per weekday", () => {
  expect(toHoursInput(draftWith([{ opens: "18:00", closes: "" }]))).toEqual({
    kind: "invalid",
    errors: [{ weekday: 2, reason: "time" }],
  });
  expect(toHoursInput(draftWith([{ opens: "12:00", closes: "12:00" }]))).toEqual({
    kind: "invalid",
    errors: [{ weekday: 2, reason: "time" }],
  });
  const overlapping = [
    { opens: "11:00", closes: "15:00" },
    { opens: "14:00", closes: "16:00" },
  ];
  expect(toHoursInput(draftWith(overlapping))).toEqual({
    kind: "invalid",
    errors: [{ weekday: 2, reason: "overlap" }],
  });
});

test("[MER-15] adds up to four ranges a day, updates and removes them", () => {
  let draft = draftWith([]);
  for (let count = 0; count < 4; count += 1) {
    expect(canAddHoursRange(draft, 2)).toBe(true);
    draft = addHoursRange(draft, 2);
  }
  expect(canAddHoursRange(draft, 2)).toBe(false);
  expect(addHoursRange(draft, 2)).toBe(draft);
  draft = updateHoursRange(draft, { weekday: 2, index: 1, field: "closes", value: "16:45" });
  expect(draft.weekly[2]?.ranges[1]?.closes).toBe("16:45");
  draft = removeHoursRange(draft, { weekday: 2, index: 0 });
  expect(draft.weekly[2]?.ranges).toHaveLength(3);
  expect(draft.weekly[2]?.ranges[0]?.closes).toBe("16:45");
  expect(draft.weekly[1]?.ranges).toEqual([]);
});

test("[MER-15] blames the special date, never a weekday, for a problem in the special dates", () => {
  const closed = { date: "2026-12-30", ranges: [] };
  const empty = { date: "2026-12-31", ranges: [{ opens: "10:00", closes: "10:00" }] };
  const draft = { ...draftWith([]), specialDates: [closed, empty] };
  expect(toHoursInput(draft)).toEqual({ kind: "invalid", errors: [{ index: 1, reason: "time" }] });
});

test("[MER-15] reports weekday and special-date problems together", () => {
  const draft = {
    ...draftWith([{ opens: "18:00", closes: "" }]),
    specialDates: [{ date: "2026-02-30", ranges: [] }],
  };
  expect(toHoursInput(draft)).toEqual({
    kind: "invalid",
    errors: [
      { weekday: 2, reason: "time" },
      { index: 0, reason: "date" },
    ],
  });
});

test("[MER-15] saves edited special dates with the week", () => {
  const draft = {
    ...draftWith([]),
    specialDates: [{ date: "2027-01-01", ranges: [{ opens: "18:00", closes: "02:00" }] }],
  };
  const result = toHoursInput(draft);
  expect(result.kind === "valid" && result.input.specialDates).toEqual([
    { date: "2027-01-01", ranges: [{ opensMinute: 1080, closesMinute: 120 }] },
  ]);
});
