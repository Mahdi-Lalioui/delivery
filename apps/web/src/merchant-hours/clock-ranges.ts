import type { HoursInput } from "./hours-http";

type StoredRange = HoursInput["weekly"][number]["ranges"][number];
/** Clock text as `<input type="time">` reports it, for example "18:00". */
export interface RangeDraft {
  readonly opens: string;
  readonly closes: string;
}

const dayMinutes = 1440;
export const maxRangesPerDay = 4;
export const newRange: RangeDraft = { opens: "12:00", closes: "15:00" };

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

export function toRangeDrafts(ranges: readonly StoredRange[]): RangeDraft[] {
  return ranges.map(({ opensMinute, closesMinute }) => ({
    opens: formatClock(opensMinute),
    closes: formatClock(closesMinute),
  }));
}

/** Reads one day's clock ranges, or undefined when a time is unreadable or a range is empty. */
export function parseDayRanges(ranges: readonly RangeDraft[]): StoredRange[] | undefined {
  const parsed = ranges.map(parseRange);
  const valid = parsed.filter((range) => range !== undefined);
  if (valid.length !== parsed.length) return undefined;
  return valid.every((range) => range.opensMinute !== range.closesMinute) ? valid : undefined;
}
