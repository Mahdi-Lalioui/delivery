import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { runMenuCommand, type CommandChange, type CommandRequest } from "./menu-commands.js";
import { readRamadan, replaceRamadan, type RamadanReplace } from "./merchant-ramadan.js";

export type { RamadanReplace, RamadanSchedule } from "./merchant-ramadan.js";

interface HoursRange {
  readonly opensMinute: number;
  readonly closesMinute: number;
}

export interface MerchantHours {
  readonly weekly: readonly { readonly weekday: number; readonly ranges: readonly HoursRange[] }[];
  /** A date with no ranges closes that whole Algiers civil date. */
  readonly specialDates: readonly {
    readonly date: string;
    readonly ranges: readonly HoursRange[];
  }[];
}

export type MerchantHoursReplace = CommandRequest<
  MerchantHours & { readonly expectedRevision: number }
>;

interface WeeklyRow extends HoursRange {
  readonly weekday: number;
}

interface SpecialRow {
  readonly date: string;
  readonly opensMinute: number | null;
  readonly closesMinute: number | null;
}

const weekdays = [0, 1, 2, 3, 4, 5, 6];

function groupWeekly(rows: readonly WeeklyRow[]): MerchantHours["weekly"] {
  return weekdays.map((weekday) => ({
    weekday,
    ranges: rows
      .filter((row) => row.weekday === weekday)
      .map(({ opensMinute, closesMinute }) => ({ opensMinute, closesMinute })),
  }));
}

function groupSpecial(rows: readonly SpecialRow[]): MerchantHours["specialDates"] {
  const dates = new Map<string, HoursRange[]>();
  for (const { date, opensMinute, closesMinute } of rows) {
    const ranges = dates.get(date) ?? [];
    if (opensMinute !== null && closesMinute !== null) ranges.push({ opensMinute, closesMinute });
    dates.set(date, ranges);
  }
  return [...dates].map(([date, ranges]) => ({ date, ranges }));
}

async function readHours(sql: TransactionSql, scope: MenuScope) {
  const menu = await readMenuContext(sql, scope);
  if (!menu) return undefined;
  const weekly = await sql<WeeklyRow[]>`
    SELECT weekday::int AS weekday, opens_minute::int AS "opensMinute",
      closes_minute::int AS "closesMinute"
    FROM public.merchant_hours WHERE merchant_id = ${scope.merchantId}
    ORDER BY weekday, opens_minute
  `;
  const special = await sql<SpecialRow[]>`
    SELECT to_char(day.local_date, 'YYYY-MM-DD') AS date,
      range.opens_minute::int AS "opensMinute", range.closes_minute::int AS "closesMinute"
    FROM public.merchant_special_dates AS day
    LEFT JOIN public.merchant_special_hours AS range
      ON range.merchant_id = day.merchant_id AND range.local_date = day.local_date
    WHERE day.merchant_id = ${scope.merchantId}
    ORDER BY day.local_date, range.opens_minute
  `;
  return {
    revision: menu.revision,
    weekly: groupWeekly(weekly),
    specialDates: groupSpecial(special),
  };
}

async function replaceHours(
  sql: TransactionSql,
  { merchantId, input }: MerchantHoursReplace,
): Promise<CommandChange<object, never>> {
  await sql`DELETE FROM public.merchant_hours WHERE merchant_id = ${merchantId}`;
  await sql`DELETE FROM public.merchant_special_dates WHERE merchant_id = ${merchantId}`;
  const weekly = input.weekly.flatMap(({ weekday, ranges }) =>
    ranges.map((range) => ({
      merchant_id: merchantId,
      weekday,
      opens_minute: range.opensMinute,
      closes_minute: range.closesMinute,
    })),
  );
  if (weekly.length > 0) await sql`INSERT INTO public.merchant_hours ${sql(weekly)}`;
  const dates = input.specialDates.map(({ date }) => ({
    merchant_id: merchantId,
    local_date: date,
  }));
  if (dates.length > 0) await sql`INSERT INTO public.merchant_special_dates ${sql(dates)}`;
  const special = input.specialDates.flatMap(({ date, ranges }) =>
    ranges.map((range) => ({
      merchant_id: merchantId,
      local_date: date,
      opens_minute: range.opensMinute,
      closes_minute: range.closesMinute,
    })),
  );
  if (special.length > 0) await sql`INSERT INTO public.merchant_special_hours ${sql(special)}`;
  return { kind: "changed", value: {} };
}

export function createMerchantHoursRepository({ sql }: DatabaseConnection) {
  return {
    read: (scope: MenuScope) =>
      sql.begin("isolation level repeatable read read only", (tx) => readHours(tx, scope)),
    replace: (request: MerchantHoursReplace) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "hours_replace",
          apply: () => replaceHours(tx, request),
        }),
      ),
    readRamadan: (scope: MenuScope) =>
      sql.begin("isolation level repeatable read read only", (tx) => readRamadan(tx, scope)),
    replaceRamadan: (request: RamadanReplace) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "ramadan_replace",
          apply: () => replaceRamadan(tx, request),
        }),
      ),
  };
}
