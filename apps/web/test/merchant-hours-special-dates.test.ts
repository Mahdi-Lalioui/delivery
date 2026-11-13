import { maxSpecialDates } from "@zaafran/contracts/merchant-hours";
import { expect, test } from "vitest";
import {
  addSpecialDate,
  addSpecialDateRange,
  canAddSpecialDate,
  removeSpecialDate,
  removeSpecialDateRange,
  toSpecialDateDrafts,
  toSpecialDatesInput,
  updateSpecialDate,
  updateSpecialDateRange,
  type SpecialDateDraft,
} from "../src/merchant-hours/special-dates-editor";

const stored = [
  { date: "2026-12-31", ranges: [] },
  { date: "2027-01-01", ranges: [{ opensMinute: 1080, closesMinute: 120 }] },
];

test("[MER-15] round-trips stored special dates through the editable draft", () => {
  const drafts = toSpecialDateDrafts(stored);
  expect(drafts).toEqual([
    { date: "2026-12-31", ranges: [] },
    { date: "2027-01-01", ranges: [{ opens: "18:00", closes: "02:00" }] },
  ]);
  expect(toSpecialDatesInput(drafts)).toEqual({ kind: "valid", specialDates: stored });
});

test("[MER-15] a new special date starts closed all day on the given date", () => {
  const drafts = addSpecialDate([], "2026-11-20");
  expect(drafts).toEqual([{ date: "2026-11-20", ranges: [] }]);
  expect(toSpecialDatesInput(drafts)).toEqual({
    kind: "valid",
    specialDates: [{ date: "2026-11-20", ranges: [] }],
  });
});

test("[MER-15] edits the date and its ranges, including a range past midnight", () => {
  let drafts = addSpecialDate([], "2026-11-20");
  drafts = updateSpecialDate(drafts, { index: 0, date: "2026-11-21" });
  drafts = addSpecialDateRange(drafts, 0);
  drafts = updateSpecialDateRange(drafts, {
    index: 0,
    rangeIndex: 0,
    field: "opens",
    value: "18:00",
  });
  drafts = updateSpecialDateRange(drafts, {
    index: 0,
    rangeIndex: 0,
    field: "closes",
    value: "٠٢:٣٠",
  });
  expect(toSpecialDatesInput(drafts)).toEqual({
    kind: "valid",
    specialDates: [{ date: "2026-11-21", ranges: [{ opensMinute: 1080, closesMinute: 150 }] }],
  });
});

test("[MER-15] removes a range and a whole special date without touching the others", () => {
  let drafts = toSpecialDateDrafts(stored);
  drafts = removeSpecialDateRange(drafts, { index: 1, rangeIndex: 0 });
  expect(drafts[1]).toEqual({ date: "2027-01-01", ranges: [] });
  drafts = removeSpecialDate(drafts, 0);
  expect(drafts).toEqual([{ date: "2027-01-01", ranges: [] }]);
});

test("[MER-15] reports an invalid date, an unreadable time and an overlap per entry", () => {
  const drafts: SpecialDateDraft[] = [
    { date: "2026-02-30", ranges: [] },
    { date: "2026-12-01", ranges: [{ opens: "18:00", closes: "" }] },
    {
      date: "2026-12-02",
      ranges: [
        { opens: "12:00", closes: "15:00" },
        { opens: "14:00", closes: "16:00" },
      ],
    },
    { date: "2026-12-03", ranges: [{ opens: "10:00", closes: "10:00" }] },
  ];
  expect(toSpecialDatesInput(drafts)).toEqual({
    kind: "invalid",
    errors: [
      { index: 0, reason: "date" },
      { index: 1, reason: "time" },
      { index: 2, reason: "overlap" },
      { index: 3, reason: "time" },
    ],
  });
});

test("[MER-15] flags every repeat of a date after the first", () => {
  const drafts = [
    { date: "2026-12-31", ranges: [] },
    { date: "2027-01-01", ranges: [] },
    { date: "2026-12-31", ranges: [] },
  ];
  expect(toSpecialDatesInput(drafts)).toEqual({
    kind: "invalid",
    errors: [{ index: 2, reason: "duplicate" }],
  });
});

test("[MER-15] stops adding dates and ranges at the contract limits", () => {
  const full = Array.from({ length: maxSpecialDates }, (_, day) => ({
    date: `2027-${String(Math.floor(day / 28) + 1).padStart(2, "0")}-${String((day % 28) + 1).padStart(2, "0")}`,
    ranges: [],
  }));
  expect(canAddSpecialDate(full)).toBe(false);
  expect(addSpecialDate(full, "2028-01-01")).toBe(full);
  let drafts = addSpecialDate([], "2026-11-20");
  for (let count = 0; count < 6; count += 1) drafts = addSpecialDateRange(drafts, 0);
  expect(drafts[0]?.ranges).toHaveLength(4);
  expect(addSpecialDateRange(drafts, 5)).toBe(drafts);
});
