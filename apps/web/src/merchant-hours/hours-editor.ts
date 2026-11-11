import { maxSpecialDates, merchantHoursInput } from "@zaafran/contracts/merchant-hours";
import type { HoursInput } from "./hours-http";

type StoredRange = HoursInput["weekly"][number]["ranges"][number];
/** Clock text as `<input type="time">` reports it, for example "18:00". */
export interface RangeDraft {
  readonly opens: string;
  readonly closes: string;
}
export interface SpecialDateDraft {
  readonly id: string;
  readonly date: string;
  readonly ranges: readonly RangeDraft[];
}
export interface HoursDraft {
  readonly weekly: readonly { readonly weekday: number; readonly ranges: readonly RangeDraft[] }[];
  readonly specialDates: readonly SpecialDateDraft[];
}
export type DayError = { weekday: number; reason: "time" | "overlap" };
export type SpecialDateError =
  | { dateId: string; reason: "date" | "duplicate" | "overlap" | "limit" }
  | { dateId: string; reason: "time"; index: number; field: keyof RangeDraft };
export type HoursError = DayError | SpecialDateError;
export type HoursValidation =
  { kind: "valid"; input: HoursInput } | { kind: "invalid"; errors: HoursError[] };

export type SpecialDateRangeAddress = { dateId: string; index: number };
type RangeEdit = { field: keyof RangeDraft; value: string };
type ParsedRange =
  { kind: "valid"; range: StoredRange } | { kind: "invalid"; field: keyof RangeDraft };

const dayMinutes = 1440;
export const maxRangesPerDay = 4;
const newRange: RangeDraft = { opens: "12:00", closes: "15:00" };
const specialDateSchema = merchantHoursInput.shape.specialDates.element;

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
function parseRange({ opens, closes }: RangeDraft): ParsedRange {
  const opensMinute = parseClock(opens);
  if (opensMinute === undefined) return { kind: "invalid", field: "opens" };
  const closesClock = parseClock(closes);
  const closesMinute = closesClock === 0 ? dayMinutes : closesClock;
  if (closesMinute === undefined || opensMinute === closesMinute) {
    return { kind: "invalid", field: "closes" };
  }
  return { kind: "valid", range: { opensMinute, closesMinute } };
}

export function isOvernightRange(range: RangeDraft): boolean {
  const parsed = parseRange(range);
  return parsed.kind === "valid" && parsed.range.closesMinute < parsed.range.opensMinute;
}

function toRangeDraft({ opensMinute, closesMinute }: StoredRange): RangeDraft {
  return { opens: formatClock(opensMinute), closes: formatClock(closesMinute) };
}

export function toHoursDraft(hours: HoursInput): HoursDraft {
  return {
    weekly: hours.weekly.map(({ weekday, ranges }) => ({
      weekday,
      ranges: ranges.map(toRangeDraft),
    })),
    specialDates: hours.specialDates.map(({ date, ranges }) => ({
      id: `stored-${date}`,
      date,
      ranges: ranges.map(toRangeDraft),
    })),
  };
}

function parseDay(
  ranges: readonly RangeDraft[],
):
  | { kind: "valid"; ranges: StoredRange[] }
  | { kind: "invalid"; index: number; field: keyof RangeDraft } {
  const parsed: StoredRange[] = [];
  for (const [index, range] of ranges.entries()) {
    const result = parseRange(range);
    if (result.kind === "invalid") return { ...result, index };
    parsed.push(result.range);
  }
  return { kind: "valid", ranges: parsed };
}

function readWeek(draft: HoursDraft) {
  const errors: DayError[] = [];
  const weekly = draft.weekly.map(({ weekday, ranges }) => {
    const parsed = parseDay(ranges);
    if (parsed.kind === "invalid") errors.push({ weekday, reason: "time" });
    return { weekday, ranges: parsed.kind === "valid" ? parsed.ranges : [] };
  });
  if (errors.length > 0) return { kind: "invalid", errors } as const;
  const result = merchantHoursInput.shape.weekly.safeParse(weekly);
  if (result.success) return { kind: "valid", weekly: result.data } as const;
  const days = new Set(result.error.issues.map(({ path }) => path[0]));
  return {
    kind: "invalid",
    errors: weekly.flatMap(({ weekday }, index): DayError[] =>
      days.has(index) ? [{ weekday, reason: "overlap" }] : [],
    ),
  } as const;
}

function readSpecialDate(
  { id: dateId, date, ranges }: SpecialDateDraft,
  seen: Set<string>,
): { entry: HoursInput["specialDates"][number] } | SpecialDateError {
  if (!specialDateSchema.shape.date.safeParse(date).success) return { dateId, reason: "date" };
  if (seen.has(date)) return { dateId, reason: "duplicate" };
  seen.add(date);
  if (ranges.length > maxRangesPerDay) return { dateId, reason: "limit" };

  const parsed = parseDay(ranges);
  if (parsed.kind === "invalid") {
    return { dateId, reason: "time", index: parsed.index, field: parsed.field };
  }
  const result = specialDateSchema.shape.ranges.safeParse(parsed.ranges);
  return result.success ? { entry: { date, ranges: result.data } } : { dateId, reason: "overlap" };
}

function readSpecialDates(draft: HoursDraft) {
  const specialDates: HoursInput["specialDates"] = [];
  const errors: SpecialDateError[] = [];
  const seen = new Set<string>();
  for (const [index, date] of draft.specialDates.entries()) {
    const result =
      index >= maxSpecialDates
        ? ({ dateId: date.id, reason: "limit" } as const)
        : readSpecialDate(date, seen);
    if ("entry" in result) specialDates.push(result.entry);
    else errors.push(result);
  }
  return { specialDates, errors };
}

/** The editor validates dates and ranges against the same schema the API uses. */
export function toHoursInput(draft: HoursDraft): HoursValidation {
  const week = readWeek(draft);
  const dates = readSpecialDates(draft);
  if (week.kind === "invalid")
    return { kind: "invalid", errors: [...week.errors, ...dates.errors] };
  if (dates.errors.length > 0) return { kind: "invalid", errors: dates.errors };
  return {
    kind: "valid",
    input: { weekly: week.weekly, specialDates: dates.specialDates },
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
  { weekday, ...change }: { weekday: number; index: number } & RangeEdit,
): HoursDraft {
  return mapDay(draft, weekday, (ranges) => updateRange(ranges, change));
}

export function removeHoursRange(
  draft: HoursDraft,
  { weekday, index }: { weekday: number; index: number },
): HoursDraft {
  return mapDay(draft, weekday, (ranges) => ranges.filter((_, position) => position !== index));
}

function updateRange(
  ranges: readonly RangeDraft[],
  { index, field, value }: RangeEdit & { index: number },
) {
  return ranges.map((range, position) =>
    position === index ? { ...range, [field]: value } : range,
  );
}

export function canAddSpecialDate(draft: HoursDraft): boolean {
  return draft.specialDates.length < maxSpecialDates;
}

export function addSpecialDate(draft: HoursDraft, id: string): HoursDraft {
  if (!canAddSpecialDate(draft) || draft.specialDates.some((entry) => entry.id === id))
    return draft;
  return { ...draft, specialDates: [...draft.specialDates, { id, date: "", ranges: [] }] };
}

function mapSpecialDate(
  draft: HoursDraft,
  dateId: string,
  update: (entry: SpecialDateDraft) => SpecialDateDraft,
): HoursDraft {
  const target = draft.specialDates.find((entry) => entry.id === dateId);
  if (!target) return draft;
  return {
    ...draft,
    specialDates: draft.specialDates.map((entry) => (entry === target ? update(entry) : entry)),
  };
}

export function changeSpecialDate(
  draft: HoursDraft,
  { dateId, value }: { dateId: string; value: string },
) {
  return mapSpecialDate(draft, dateId, (entry) => ({ ...entry, date: value }));
}

export function removeSpecialDate(draft: HoursDraft, dateId: string): HoursDraft {
  const specialDates = draft.specialDates.filter(({ id }) => id !== dateId);
  return specialDates.length === draft.specialDates.length ? draft : { ...draft, specialDates };
}

export function canAddSpecialDateRange(draft: HoursDraft, dateId: string): boolean {
  const entry = draft.specialDates.find(({ id }) => id === dateId);
  return entry !== undefined && entry.ranges.length < maxRangesPerDay;
}

export function addSpecialDateRange(draft: HoursDraft, dateId: string): HoursDraft {
  if (!canAddSpecialDateRange(draft, dateId)) return draft;
  return mapSpecialDate(draft, dateId, (entry) => ({
    ...entry,
    ranges: [...entry.ranges, newRange],
  }));
}

export function changeSpecialDateRange(
  draft: HoursDraft,
  { dateId, ...change }: SpecialDateRangeAddress & RangeEdit,
): HoursDraft {
  return mapSpecialDate(draft, dateId, (entry) => ({
    ...entry,
    ranges: updateRange(entry.ranges, change),
  }));
}

export function removeSpecialDateRange(
  draft: HoursDraft,
  { dateId, index }: SpecialDateRangeAddress,
) {
  return mapSpecialDate(draft, dateId, (entry) => ({
    ...entry,
    ranges: entry.ranges.filter((_, position) => position !== index),
  }));
}
