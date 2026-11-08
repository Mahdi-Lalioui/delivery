import { expect, test } from "vitest";
import {
  parseMinuteOffset,
  toRamadanDraft,
  toRamadanInput,
  type RamadanDraft,
} from "../src/merchant-hours/ramadan-editor";

const emptyWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] }));
const schedule = {
  weekly: emptyWeek.map((day) =>
    day.weekday === 1
      ? {
          weekday: 1,
          ranges: [
            {
              opens: { kind: "maghrib", minutes: -60 },
              closes: { kind: "clock", minuteOfDay: 120 },
            } as const,
          ],
        }
      : day,
  ),
  suhoor: { opensMinute: 180, closesMinute: 270 },
  method: "Algeria",
  adjustmentMinutes: -3,
} as const;

test.each([
  ["-60", -60],
  ["+30", 30],
  ["−15", -15],
  ["٤٥", 45],
  ["0", 0],
])("[MER-16] reads the minute offset %j as %i", (text, minutes) => {
  expect(parseMinuteOffset(text)).toBe(minutes);
});

test.each(["", "1.5", "--3", "ten"])("[MER-16] rejects the minute offset %j", (text) => {
  expect(parseMinuteOffset(text)).toBeUndefined();
});

test("[MER-16] starts an unsaved schedule closed every day with the Algerian method", () => {
  expect(toRamadanDraft(null)).toEqual({
    weekly: emptyWeek,
    suhoor: null,
    method: "Algeria",
    adjustment: "0",
  });
});

test("[MER-16] round-trips Maghrib-relative and clock endpoints, suhoor and adjustment", () => {
  const draft = toRamadanDraft(schedule);
  expect(draft.weekly[1]?.ranges).toEqual([
    { opens: { kind: "maghrib", offset: "-60" }, closes: { kind: "clock", time: "02:00" } },
  ]);
  expect(draft.suhoor).toEqual({ opens: "03:00", closes: "04:30" });
  expect(draft.adjustment).toBe("-3");
  expect(toRamadanInput(draft)).toEqual({ kind: "valid", input: schedule });
});

test("[MER-16] reports unreadable days, suhoor and adjustment separately", () => {
  const draft: RamadanDraft = {
    ...toRamadanDraft(schedule),
    weekly: emptyWeek.map((day) =>
      day.weekday === 4
        ? {
            weekday: 4,
            ranges: [
              {
                opens: { kind: "maghrib", offset: "abc" },
                closes: { kind: "clock", time: "02:00" },
              },
            ],
          }
        : day,
    ),
    suhoor: { opens: "03:00", closes: "03:00" },
    adjustment: "45",
  };
  expect(toRamadanInput(draft)).toEqual({
    kind: "invalid",
    errors: [{ field: "day", weekday: 4 }, { field: "suhoor" }, { field: "adjustment" }],
  });
});

test("[MER-16] rejects a Maghrib offset beyond twelve hours through the contract", () => {
  const draft = toRamadanDraft(schedule);
  const far: RamadanDraft = {
    ...draft,
    weekly: draft.weekly.map((day) =>
      day.weekday === 1
        ? {
            weekday: 1,
            ranges: [
              {
                opens: { kind: "maghrib", offset: "-721" },
                closes: { kind: "clock", time: "02:00" },
              },
            ],
          }
        : day,
    ),
  };
  expect(toRamadanInput(far)).toEqual({ kind: "invalid", errors: [{ field: "day", weekday: 1 }] });
});
