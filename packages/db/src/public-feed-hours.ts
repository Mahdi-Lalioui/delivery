import {
  dayMs,
  getAlgiersDate,
  getAlgiersDayStart,
  isCalendarInstant,
  isOpenAt,
} from "@zaafran/domain/hours";
import type { BusinessHours } from "@zaafran/domain/hours";
import { getHoursPreview } from "@zaafran/domain/hours-preview";
import type { TransactionSql } from "postgres";

type SpecialHours = NonNullable<BusinessHours["special"]>;
type HoursRow<Hours> = { readonly merchantId: string; readonly hours: Hours };

async function readWeekly(sql: TransactionSql, merchantIds: string[]) {
  return sql<HoursRow<BusinessHours["weekly"]>[]>`
    SELECT merchant_id AS "merchantId", jsonb_object_agg(weekday, ranges) AS hours
    FROM (
      SELECT merchant_id, weekday, jsonb_agg(jsonb_build_object(
        'opensMinute', opens_minute, 'closesMinute', closes_minute
      )) AS ranges
      FROM public.merchant_hours WHERE merchant_id = ANY(${merchantIds}::uuid[])
      GROUP BY merchant_id, weekday
    ) AS grouped
    GROUP BY merchant_id
  `;
}

async function readSpecial(sql: TransactionSql, merchantIds: string[], previousDate: string) {
  return sql<HoursRow<SpecialHours>[]>`
    SELECT merchant_id AS "merchantId", jsonb_object_agg(local_date, ranges) AS hours
    FROM (
      SELECT day.merchant_id, to_char(day.local_date, 'YYYY-MM-DD') AS local_date,
        coalesce(jsonb_agg(jsonb_build_object(
          'opensMinute', span.opens_minute, 'closesMinute', span.closes_minute
        )) FILTER (WHERE span.opens_minute IS NOT NULL), '[]'::jsonb) AS ranges
      FROM public.merchant_special_dates AS day
      LEFT JOIN public.merchant_special_hours AS span
        ON span.merchant_id = day.merchant_id AND span.local_date = day.local_date
      WHERE day.merchant_id = ANY(${merchantIds}::uuid[]) AND day.local_date >= ${previousDate}::date
      GROUP BY day.merchant_id, day.local_date
    ) AS grouped
    GROUP BY merchant_id
  `;
}

export async function readFeedHours(sql: TransactionSql, merchantIds: string[], now: number) {
  const previousDate = getAlgiersDate(getAlgiersDayStart(now) - dayMs).isoDate;
  const [weekly, special] = await Promise.all([
    readWeekly(sql, merchantIds),
    readSpecial(sql, merchantIds, previousDate),
  ]);
  return {
    weekly: new Map(weekly.map(({ merchantId, hours }) => [merchantId, hours])),
    special: new Map(special.map(({ merchantId, hours }) => [merchantId, hours])),
  };
}

function candidateWeeks(hours: BusinessHours, previousDay: number) {
  const special = Object.entries(hours.special ?? {});
  if (Object.keys(hours.weekly).length > 0) {
    // A full week with no opening uses up at least one dated exception. The first
    // week also includes time before the search so overnight spill is visible.
    return Array.from(
      { length: special.length + 2 },
      (_, index) => previousDay + index * 7 * dayMs,
    );
  }

  // With no weekly hours, jump directly to each dated opening.
  return special
    .filter(([, ranges]) => ranges?.length)
    .map(([date]) => getAlgiersDayStart(Date.parse(date)))
    .filter((day) => day >= previousDay)
    .sort((first, second) => first - second);
}

function findNextOpening(hours: BusinessHours, now: number): string | null {
  const eligibleAt = Math.max(now, hours.pausedUntil ?? 0);
  if (!isCalendarInstant(eligibleAt)) return null;

  const previousDay = getAlgiersDayStart(eligibleAt) - dayMs;
  for (const from of candidateWeeks(hours, previousDay)) {
    const next = getHoursPreview({ hours, from })
      .flatMap(({ intervals }) => intervals)
      .find(({ closesAt }) => closesAt > eligibleAt);
    if (next) {
      const opening = new Date(Math.max(next.opensAt, eligibleAt));
      // The public RFC 3339 representation has a four-digit year.
      return opening.getUTCFullYear() <= 9999 ? opening.toISOString() : null;
    }
  }
  return null;
}

export function getFeedAvailability(hours: BusinessHours, now: number) {
  const isOpen = isOpenAt({ hours, at: now });
  return { isOpen, nextOpensAt: isOpen ? null : findNextOpening(hours, now) };
}
