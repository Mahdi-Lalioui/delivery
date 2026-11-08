export type OpeningRange = {
  readonly opensMinute: number;
  readonly closesMinute: number;
};

export type BusinessHours = {
  /** Weekday 0 is Sunday. Each range is anchored to its opening date. */
  readonly weekly: Readonly<Partial<Record<number, readonly OpeningRange[]>>>;
  /** An empty entry closes the entire Algiers civil date, including overnight spill. */
  readonly special?: Readonly<Partial<Record<string, readonly OpeningRange[]>>>;
  readonly pausedUntil?: number;
};

export type Interval = { opensAt: number; closesAt: number };

export const minuteMs = 60_000;
const dayMinutes = 1440;
export const dayMs = dayMinutes * minuteMs;
// Africa/Algiers has used UTC+01:00 without DST since 1981.
const algiersOffsetMs = 60 * minuteMs;
const slotMs = 15 * minuteMs;
const firstCalendarInstant = Date.UTC(1982, 0, 1);
const latestCalendarInstant = 8_640_000_000_000_000 - algiersOffsetMs;

export function isCalendarInstant(at: number): boolean {
  return Number.isSafeInteger(at) && at >= firstCalendarInstant && at <= latestCalendarInstant;
}

export function getAlgiersDayStart(at: number): number {
  return Math.floor((at + algiersOffsetMs) / dayMs) * dayMs - algiersOffsetMs;
}

/** The Algiers civil date (YYYY-MM-DD) and weekday (0 = Sunday) of a local day start. */
export function getAlgiersDate(dayStart: number): { isoDate: string; weekday: number } {
  const localDate = new Date(dayStart + algiersOffsetMs);
  const localMidnight = localDate.toISOString();
  return {
    isoDate: localMidnight.slice(0, localMidnight.indexOf("T")),
    weekday: localDate.getUTCDay(),
  };
}

export function getDaySchedule(dayStart: number, hours: BusinessHours) {
  const { isoDate, weekday } = getAlgiersDate(dayStart);
  const special = hours.special?.[isoDate];
  return {
    isSpecial: special !== undefined,
    ranges: special ?? hours.weekly[weekday] ?? [],
  };
}

function isValidRange({ opensMinute, closesMinute }: OpeningRange): boolean {
  return (
    Number.isInteger(opensMinute) &&
    opensMinute >= 0 &&
    opensMinute < dayMinutes &&
    Number.isInteger(closesMinute) &&
    closesMinute >= 0 &&
    closesMinute <= dayMinutes &&
    closesMinute !== opensMinute
  );
}

export function toIntervals(dayStart: number, ranges: readonly OpeningRange[]): Interval[] {
  return ranges.filter(isValidRange).map(({ opensMinute, closesMinute }) => {
    const closeDay = closesMinute < opensMinute ? dayStart + dayMs : dayStart;
    return {
      opensAt: dayStart + opensMinute * minuteMs,
      closesAt: closeDay + closesMinute * minuteMs,
    };
  });
}

function getDayIntervals(dayStart: number, hours: BusinessHours): Interval[] {
  const { isSpecial, ranges } = getDaySchedule(dayStart, hours);
  const midnight = dayStart + dayMs;
  const today = toIntervals(dayStart, ranges).map(({ opensAt, closesAt }) => ({
    opensAt,
    closesAt: Math.min(closesAt, midnight),
  }));
  if (isSpecial) return today;

  const yesterday = dayStart - dayMs;
  const spill = toIntervals(yesterday, getDaySchedule(yesterday, hours).ranges)
    .filter(({ closesAt }) => closesAt > dayStart)
    .map(({ closesAt }) => ({ opensAt: dayStart, closesAt }));
  return [...today, ...spill];
}

export function isOpenAt({
  hours,
  at,
}: {
  readonly hours: BusinessHours;
  readonly at: number;
}): boolean {
  if (!isCalendarInstant(at) || !(at >= (hours.pausedUntil ?? 0))) return false;
  return getDayIntervals(getAlgiersDayStart(at), hours).some(
    ({ opensAt, closesAt }) => opensAt <= at && at < closesAt,
  );
}

function isDuration(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes >= 0;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const interval of intervals.sort((a, b) => a.opensAt - b.opensAt)) {
    const last = merged.at(-1);
    if (!last || last.closesAt < interval.opensAt) merged.push(interval);
    else last.closesAt = Math.max(last.closesAt, interval.closesAt);
  }
  return merged;
}

function getIntervalsBetween({
  hours,
  from,
  through,
}: {
  hours: BusinessHours;
  from: number;
  through: number;
}): Interval[] {
  const intervals: Interval[] = [];
  for (let day = getAlgiersDayStart(from); day <= through; day += dayMs) {
    intervals.push(...getDayIntervals(day, hours));
  }
  return mergeIntervals(intervals);
}

function roundUpToSlot(at: number): number {
  return Math.ceil(at / slotMs) * slotMs;
}

export function getScheduledSlots({
  hours,
  now,
  prepMinutes,
  travelMinutes,
}: {
  readonly hours: BusinessHours;
  readonly now: number;
  readonly prepMinutes: number;
  readonly travelMinutes: number;
}): number[] {
  if (!isCalendarInstant(now) || !isDuration(prepMinutes) || !isDuration(travelMinutes)) return [];
  const latest = now + 3 * dayMs;
  const prepMs = prepMinutes * minuteMs;
  const readyAt = now + prepMs + travelMinutes * minuteMs;
  const earliest = roundUpToSlot(Math.max(now + 1, readyAt, hours.pausedUntil ?? 0));
  const through = Math.ceil(latest + prepMs);
  if (!(earliest <= latest) || !isCalendarInstant(through)) return [];

  const windows = getIntervalsBetween({ hours, from: earliest, through });
  const slots: number[] = [];
  for (const { opensAt, closesAt } of windows) {
    const start = roundUpToSlot(Math.max(earliest, opensAt));
    const end = Math.min(latest, closesAt - prepMs);
    for (let slot = start; slot <= end && slot < closesAt; slot += slotMs) slots.push(slot);
  }
  return slots;
}
