import { z } from "zod";

const dayMinutes = 1440;
const maxRangesPerDay = 4;
const maxSpecialDates = 60;

// A range closing at or before it opens runs past midnight into the next day (18:00–02:00).
const openingRange = z
  .strictObject({
    opensMinute: z
      .int()
      .min(0)
      .max(dayMinutes - 1),
    closesMinute: z.int().min(0).max(dayMinutes),
  })
  .refine((range) => range.opensMinute !== range.closesMinute, "A range cannot be empty.");

type OpeningRange = z.infer<typeof openingRange>;

function closesAfterOpening({ opensMinute, closesMinute }: OpeningRange): number {
  return closesMinute > opensMinute ? closesMinute : closesMinute + dayMinutes;
}

function hasNoOverlap(ranges: readonly OpeningRange[]): boolean {
  const sorted = [...ranges].sort((a, b) => a.opensMinute - b.opensMinute);
  return sorted.every((range, index) => {
    const previous = sorted[index - 1];
    return !previous || closesAfterOpening(previous) <= range.opensMinute;
  });
}

const dayRanges = z
  .array(openingRange)
  .max(maxRangesPerDay)
  .refine(hasNoOverlap, "Ranges on one day cannot overlap.");

const weeklyDay = z.strictObject({ weekday: z.int().min(0).max(6), ranges: dayRanges });

/** Weekday 0 is Sunday, matching the M1 hours rules. */
const weekly = z
  .array(weeklyDay)
  .length(7)
  .refine(
    (days) => new Set(days.map((day) => day.weekday)).size === days.length,
    "List each weekday once.",
  );

/** An empty range list closes the whole Algiers civil date. */
const specialDate = z.strictObject({ date: z.iso.date(), ranges: dayRanges });

const specialDates = z
  .array(specialDate)
  .max(maxSpecialDates)
  .refine(
    (dates) => new Set(dates.map((entry) => entry.date)).size === dates.length,
    "List each special date once.",
  );

export const merchantHoursInput = z.strictObject({ weekly, specialDates });
