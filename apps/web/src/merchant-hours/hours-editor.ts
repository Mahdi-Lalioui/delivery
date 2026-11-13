import { merchantHoursInput } from "@zaafran/contracts/merchant-hours";
import {
  maxRangesPerDay,
  newRange,
  parseDayRanges,
  toRangeDrafts,
  type RangeDraft,
} from "./clock-ranges";
import type { HoursInput } from "./hours-http";
import {
  toSpecialDateDrafts,
  toSpecialDatesInput,
  type SpecialDateDraft,
  type SpecialDateError,
} from "./special-dates-editor";

type Weekly = HoursInput["weekly"];
export interface HoursDraft {
  readonly weekly: readonly { readonly weekday: number; readonly ranges: readonly RangeDraft[] }[];
  readonly specialDates: readonly SpecialDateDraft[];
}
export type DayError = { weekday: number; reason: "time" | "overlap" };
export type HoursError = DayError | SpecialDateError;
export type HoursValidation =
  { kind: "valid"; input: HoursInput } | { kind: "invalid"; errors: HoursError[] };

export function isDayError(error: HoursError): error is DayError {
  return "weekday" in error;
}

export function toHoursDraft(hours: HoursInput): HoursDraft {
  return {
    weekly: hours.weekly.map(({ weekday, ranges }) => ({ weekday, ranges: toRangeDrafts(ranges) })),
    specialDates: toSpecialDateDrafts(hours.specialDates),
  };
}

/** Unreadable times hide overlap checks for the week, as a range must parse to overlap. */
function parseWeek(draft: HoursDraft["weekly"]): { weekly: Weekly; errors: DayError[] } {
  const errors: DayError[] = [];
  const weekly = draft.map(({ weekday, ranges }) => {
    const parsed = parseDayRanges(ranges);
    if (!parsed) errors.push({ weekday, reason: "time" });
    return { weekday, ranges: parsed ?? [] };
  });
  if (errors.length > 0) return { weekly, errors };
  const result = merchantHoursInput.shape.weekly.safeParse(weekly);
  if (result.success) return { weekly, errors };
  const days = new Set(result.error.issues.map(({ path }) => path[0]));
  const overlaps = weekly
    .filter((_, index) => days.has(index))
    .map(({ weekday }) => ({ weekday, reason: "overlap" as const }));
  return { weekly, errors: overlaps };
}

/** The contract decides validity, so the editor never disagrees with the API. */
export function toHoursInput(draft: HoursDraft): HoursValidation {
  const week = parseWeek(draft.weekly);
  const dates = toSpecialDatesInput(draft.specialDates);
  const dateErrors = dates.kind === "invalid" ? dates.errors : [];
  const errors: HoursError[] = [...week.errors, ...dateErrors];
  if (errors.length > 0 || dates.kind === "invalid") return { kind: "invalid", errors };
  const result = merchantHoursInput.safeParse({
    weekly: week.weekly,
    specialDates: dates.specialDates,
  });
  return result.success ? { kind: "valid", input: result.data } : { kind: "invalid", errors };
}

function mapDay(
  draft: HoursDraft,
  weekday: number,
  change: (ranges: readonly RangeDraft[]) => readonly RangeDraft[],
): HoursDraft {
  return {
    ...draft,
    weekly: draft.weekly.map((day) =>
      day.weekday === weekday ? { weekday, ranges: change(day.ranges) } : day,
    ),
  };
}

export function canAddHoursRange(draft: HoursDraft, weekday: number): boolean {
  const day = draft.weekly.find((entry) => entry.weekday === weekday);
  return day !== undefined && day.ranges.length < maxRangesPerDay;
}

export function addHoursRange(draft: HoursDraft, weekday: number): HoursDraft {
  if (!canAddHoursRange(draft, weekday)) return draft;
  return mapDay(draft, weekday, (ranges) => [...ranges, newRange]);
}

export function updateHoursRange(
  draft: HoursDraft,
  change: { weekday: number; index: number; field: keyof RangeDraft; value: string },
): HoursDraft {
  return mapDay(draft, change.weekday, (ranges) =>
    ranges.map((range, index) =>
      index === change.index ? { ...range, [change.field]: change.value } : range,
    ),
  );
}

export function removeHoursRange(
  draft: HoursDraft,
  { weekday, index }: { weekday: number; index: number },
): HoursDraft {
  return mapDay(draft, weekday, (ranges) => ranges.filter((_, position) => position !== index));
}
