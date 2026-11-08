import type { merchantRamadanInput } from "@zaafran/contracts/merchant-hours";
import type { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import { dayMs, getAlgiersDate, getAlgiersDayStart } from "@zaafran/domain/hours";
import type { BusinessHours, OpeningRange } from "@zaafran/domain/hours";
import { getHoursPreview } from "@zaafran/domain/hours-preview";
import type { HoursPreviewDay } from "@zaafran/domain/hours-preview";
import { calculateMaghrib } from "@zaafran/geo/maghrib";
import type { z } from "zod";

type Repository = ReturnType<typeof createMerchantHoursRepository>;
type StoredSchedule = NonNullable<Awaited<ReturnType<Repository["readSchedule"]>>>;
type StoredRamadan = z.infer<typeof merchantRamadanInput>;
/** The stored schedule with its Ramadan part re-checked by the contract. */
type Schedule = Omit<StoredSchedule, "ramadan"> & { readonly ramadan: StoredRamadan | null };
export type PreviewSchedule = "regular" | "ramadan";

function byWeekday<Range>(weekly: readonly { weekday: number; ranges: readonly Range[] }[]) {
  return Object.fromEntries(weekly.map(({ weekday, ranges }) => [weekday, ranges]));
}

function toBusinessHours({ hours, pausedUntil }: Schedule): BusinessHours {
  const special: Record<string, readonly OpeningRange[]> = Object.fromEntries(
    hours.specialDates.map(({ date, ranges }) => [date, ranges]),
  );
  const base = { weekly: byWeekday(hours.weekly), special };
  return pausedUntil === null ? base : { ...base, pausedUntil: Date.parse(pausedUntil) };
}

function getMaghribByDate(ramadan: StoredRamadan, schedule: Schedule, firstDay: number) {
  const maghribAtByDate: Record<string, number> = {};
  for (let index = 0; index < 7; index += 1) {
    const { isoDate } = getAlgiersDate(firstDay + index * dayMs);
    const maghribAt = calculateMaghrib({
      date: isoDate,
      coordinates: schedule.coordinates,
      method: ramadan.method,
      adjustmentMinutes: ramadan.adjustmentMinutes,
    });
    if (maghribAt !== null) maghribAtByDate[isoDate] = maghribAt;
  }
  return maghribAtByDate;
}

function toIso(at: number): string {
  return new Date(at).toISOString();
}

function serializeDay({ date, source, maghribAt, intervals }: HoursPreviewDay) {
  return {
    date,
    source,
    maghribAt: maghribAt === null ? null : toIso(maghribAt),
    intervals: intervals.map(({ opensAt, closesAt }) => ({
      opensAt: toIso(opensAt),
      closesAt: toIso(closesAt),
    })),
  };
}

/** The seven-day preview from `now`; Ramadan days need a saved Ramadan schedule. */
export function buildHoursPreview({
  schedule,
  stored,
  now,
}: {
  readonly schedule: PreviewSchedule;
  readonly stored: Schedule;
  readonly now: Date;
}) {
  const from = now.getTime();
  const hours = toBusinessHours(stored);
  const ramadan = schedule === "ramadan" ? stored.ramadan : null;
  const days = ramadan
    ? getHoursPreview({
        hours,
        from,
        ramadan: {
          weekly: byWeekday(ramadan.weekly),
          suhoor: ramadan.suhoor,
          maghribAtByDate: getMaghribByDate(ramadan, stored, getAlgiersDayStart(from)),
        },
      })
    : getHoursPreview({ hours, from });
  return { schedule, days: days.map(serializeDay) };
}
