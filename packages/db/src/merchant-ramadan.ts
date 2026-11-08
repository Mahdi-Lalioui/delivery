import type { TransactionSql } from "postgres";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import type { CommandChange, CommandRequest } from "./menu-commands.js";

type Endpoint =
  | { readonly kind: "maghrib"; readonly minutes: number }
  | { readonly kind: "clock"; readonly minuteOfDay: number };

export interface RamadanSchedule {
  readonly weekly: readonly {
    readonly weekday: number;
    readonly ranges: readonly { readonly opens: Endpoint; readonly closes: Endpoint }[];
  }[];
  readonly suhoor: { readonly opensMinute: number; readonly closesMinute: number } | null;
  readonly method: string;
  readonly adjustmentMinutes: number;
}

export type RamadanReplace = CommandRequest<
  RamadanSchedule & { readonly expectedRevision: number }
>;

interface ScheduleRow {
  readonly weekly: RamadanSchedule["weekly"];
  readonly suhoorOpens: number | null;
  readonly suhoorCloses: number | null;
  readonly method: string;
  readonly adjustmentMinutes: number;
}

function toSchedule(row: ScheduleRow): RamadanSchedule {
  const { weekly, suhoorOpens, suhoorCloses, method, adjustmentMinutes } = row;
  const suhoor =
    suhoorOpens === null || suhoorCloses === null
      ? null
      : { opensMinute: suhoorOpens, closesMinute: suhoorCloses };
  return { weekly, suhoor, method, adjustmentMinutes };
}

export async function readRamadan(sql: TransactionSql, scope: MenuScope) {
  const menu = await readMenuContext(sql, scope);
  if (!menu) return undefined;
  // The weekly ranges were validated by the merchantRamadanInput contract before being stored.
  const [row] = await sql<ScheduleRow[]>`
    SELECT weekly, suhoor_opens_minute::int AS "suhoorOpens",
      suhoor_closes_minute::int AS "suhoorCloses", method,
      adjustment_minutes::int AS "adjustmentMinutes"
    FROM public.merchant_ramadan_schedules WHERE merchant_id = ${scope.merchantId}
  `;
  return { revision: menu.revision, schedule: row ? toSchedule(row) : null };
}

export async function replaceRamadan(
  sql: TransactionSql,
  { merchantId, input }: RamadanReplace,
): Promise<CommandChange<object, never>> {
  const weekly = input.weekly.map(({ weekday, ranges }) => ({ weekday, ranges }));
  await sql`
    INSERT INTO public.merchant_ramadan_schedules
      (merchant_id, weekly, suhoor_opens_minute, suhoor_closes_minute, method, adjustment_minutes)
    VALUES (${merchantId}, ${JSON.stringify(weekly)}::jsonb, ${input.suhoor?.opensMinute ?? null},
      ${input.suhoor?.closesMinute ?? null}, ${input.method}, ${input.adjustmentMinutes})
    ON CONFLICT (merchant_id) DO UPDATE SET weekly = excluded.weekly,
      suhoor_opens_minute = excluded.suhoor_opens_minute,
      suhoor_closes_minute = excluded.suhoor_closes_minute,
      method = excluded.method, adjustment_minutes = excluded.adjustment_minutes
  `;
  return { kind: "changed", value: {} };
}
