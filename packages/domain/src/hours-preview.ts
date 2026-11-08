import {
  dayMs,
  getAlgiersDate,
  getAlgiersDayStart,
  getDaySchedule,
  isCalendarInstant,
  toIntervals,
} from "./hours.ts";
import type { BusinessHours, Interval, OpeningRange } from "./hours.ts";
import { resolveRamadanRange } from "./ramadan.ts";
import type { RamadanEndpoint } from "./ramadan.ts";

type RamadanRange = { readonly opens: RamadanEndpoint; readonly closes: RamadanEndpoint };

type RamadanPreviewInput = {
  /** Weekday 0 is Sunday. */
  readonly weekly: Readonly<Partial<Record<number, readonly RamadanRange[]>>>;
  readonly suhoor: OpeningRange | null;
  /** Maghrib instants for the Algiers dates that follow the Ramadan schedule. */
  readonly maghribAtByDate: Readonly<Partial<Record<string, number>>>;
};

export type HoursPreviewDay = {
  readonly date: string;
  readonly source: "weekly" | "special" | "ramadan";
  readonly maghribAt: number | null;
  /** Each range stays on its opening date, so 18:00–02:00 is one interval. */
  readonly intervals: readonly Interval[];
};

const previewDays = 7;

function getRamadanIntervals(
  dayStart: number,
  ramadan: RamadanPreviewInput,
  maghribAt: number,
): Interval[] {
  const { weekday } = getAlgiersDate(dayStart);
  const suhoor = ramadan.suhoor ? toIntervals(dayStart, [ramadan.suhoor]) : [];
  const evening = (ramadan.weekly[weekday] ?? []).flatMap(
    ({ opens, closes }) => resolveRamadanRange({ maghribAt, opens, closes }) ?? [],
  );
  return [...suhoor, ...evening];
}

function getAnchoredDay(
  dayStart: number,
  hours: BusinessHours,
  ramadan: RamadanPreviewInput | undefined,
): Omit<HoursPreviewDay, "intervals"> & { intervals: Interval[] } {
  const { isoDate } = getAlgiersDate(dayStart);
  const { isSpecial, ranges } = getDaySchedule(dayStart, hours);
  const maghribAt = ramadan?.maghribAtByDate[isoDate];
  if (isSpecial || !ramadan || maghribAt === undefined) {
    const source = isSpecial ? "special" : "weekly";
    return { date: isoDate, source, maghribAt: null, intervals: toIntervals(dayStart, ranges) };
  }
  const intervals = getRamadanIntervals(dayStart, ramadan, maghribAt);
  return { date: isoDate, source: "ramadan", maghribAt, intervals };
}

/** Matches the M1 open-now rule: a special next day and the closed-now override cut ranges. */
function clipInterval(interval: Interval, cutAt: number, pausedUntil: number): Interval | null {
  const opensAt = Math.max(interval.opensAt, pausedUntil);
  const closesAt = Math.min(interval.closesAt, cutAt);
  return opensAt < closesAt ? { opensAt, closesAt } : null;
}

/** The seven Algiers days starting with the one that contains `from`. */
export function getHoursPreview({
  hours,
  ramadan,
  from,
}: {
  readonly hours: BusinessHours;
  readonly ramadan?: RamadanPreviewInput;
  readonly from: number;
}): HoursPreviewDay[] {
  if (!isCalendarInstant(from)) return [];
  const firstDay = getAlgiersDayStart(from);
  return Array.from({ length: previewDays }, (_, index) => {
    const dayStart = firstDay + index * dayMs;
    const day = getAnchoredDay(dayStart, hours, ramadan);
    const nextDay = dayStart + dayMs;
    const cutAt = getDaySchedule(nextDay, hours).isSpecial ? nextDay : Number.POSITIVE_INFINITY;
    const intervals = day.intervals
      .flatMap((interval) => clipInterval(interval, cutAt, hours.pausedUntil ?? 0) ?? [])
      .sort((first, second) => first.opensAt - second.opensAt);
    return { ...day, intervals };
  });
}
