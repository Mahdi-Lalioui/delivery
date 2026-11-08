import { merchantHoursInput } from "@zaafran/contracts/merchant-hours";
import type { HoursInput } from "./hours-http";

type StoredRange = HoursInput["weekly"][number]["ranges"][number];
/** Clock text as `<input type="time">` reports it, for example "18:00". */
export interface RangeDraft {
  readonly opens: string;
  readonly closes: string;
}
export interface HoursDraft {
  readonly weekly: readonly { readonly weekday: number; readonly ranges: readonly RangeDraft[] }[];
  /** Kept unchanged until the special-dates editor exists. */
  readonly specialDates: HoursInput["specialDates"];
}
export type DayError = { weekday: number; reason: "time" | "overlap" };
export type HoursValidation =
  { kind: "valid"; input: HoursInput } | { kind: "invalid"; errors: DayError[] };

const dayMinutes = 1440;
const maxRangesPerDay = 4;
const newRange: RangeDraft = { opens: "12:00", closes: "15:00" };

/** Reads Arabic-Indic and Persian digits as Latin digits. */
export function normalizeDigits(input: string): string {
  return input.trim().replace(/[٠-٩۰-۹]/g, (digit) => {
    const zero = digit <= "٩" ? "٠" : "۰";
    return String(digit.charCodeAt(0) - zero.charCodeAt(0));
  });
}

export function parseClock(text: string): number | undefined {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(normalizeDigits(text));
  if (!match) return undefined;
  const [, hours = "", minutes = ""] = match;
  return Number(hours) * 60 + Number(minutes);
}

export function formatClock(minute: number): string {
  const ofDay = minute % dayMinutes;
  const hours = String(Math.floor(ofDay / 60)).padStart(2, "0");
  return `${hours}:${String(ofDay % 60).padStart(2, "0")}`;
}

/** Closing at 00:00 ends the day itself; any other earlier closing runs past midnight. */
function parseRange({ opens, closes }: RangeDraft): StoredRange | undefined {
  const opensMinute = parseClock(opens);
  const closesClock = parseClock(closes);
  if (opensMinute === undefined || closesClock === undefined) return undefined;
  return { opensMinute, closesMinute: closesClock === 0 ? dayMinutes : closesClock };
}

export function isOvernightRange(range: RangeDraft): boolean {
  const parsed = parseRange(range);
  return parsed !== undefined && parsed.closesMinute < parsed.opensMinute;
}

export function toHoursDraft(hours: HoursInput): HoursDraft {
  return {
    weekly: hours.weekly.map(({ weekday, ranges }) => ({
      weekday,
      ranges: ranges.map(({ opensMinute, closesMinute }) => ({
        opens: formatClock(opensMinute),
        closes: formatClock(closesMinute),
      })),
    })),
    specialDates: hours.specialDates,
  };
}

function parseDay(ranges: readonly RangeDraft[]): StoredRange[] | undefined {
  const parsed = ranges.map(parseRange);
  const valid = parsed.filter((range) => range !== undefined);
  if (valid.length !== parsed.length) return undefined;
  return valid.every((range) => range.opensMinute !== range.closesMinute) ? valid : undefined;
}

/** The contract decides validity, so the editor never disagrees with the API. */
export function toHoursInput(draft: HoursDraft): HoursValidation {
  const errors: DayError[] = [];
  const weekly = draft.weekly.map(({ weekday, ranges }) => {
    const parsed = parseDay(ranges);
    if (!parsed) errors.push({ weekday, reason: "time" });
    return { weekday, ranges: parsed ?? [] };
  });
  if (errors.length > 0) return { kind: "invalid", errors };
  const result = merchantHoursInput.safeParse({ weekly, specialDates: draft.specialDates });
  if (result.success) return { kind: "valid", input: result.data };
  const days = new Set(
    result.error.issues.filter(({ path }) => path[0] === "weekly").map(({ path }) => path[1]),
  );
  return {
    kind: "invalid",
    errors: weekly
      .filter((_, index) => days.has(index))
      .map(({ weekday }) => ({ weekday, reason: "overlap" })),
  };
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
