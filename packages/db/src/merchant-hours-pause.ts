import type { TransactionSql } from "postgres";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import type { CommandChange, CommandRequest } from "./menu-commands.js";

/** Feeds `pausedUntil` in the M1 hours rules; null means the regular hours apply. */
export type HoursPause = CommandRequest<{
  readonly pausedUntil: string | null;
  readonly expectedRevision: number;
}>;

export async function readPause(sql: TransactionSql, scope: MenuScope) {
  const menu = await readMenuContext(sql, scope);
  if (!menu) return undefined;
  const [row] = await sql<{ pausedUntil: string | null }[]>`
    SELECT to_char(hours_paused_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      AS "pausedUntil"
    FROM public.merchants WHERE id = ${scope.merchantId}
  `;
  return { revision: menu.revision, pausedUntil: row?.pausedUntil ?? null };
}

export async function setPause(
  sql: TransactionSql,
  { merchantId, input, now }: HoursPause,
): Promise<CommandChange<object, "pause_not_in_future">> {
  const { pausedUntil } = input;
  if (pausedUntil !== null && !(Date.parse(pausedUntil) > now.getTime())) {
    return { kind: "pause_not_in_future" };
  }
  await sql`
    UPDATE public.merchants SET hours_paused_until = ${pausedUntil}::timestamptz
    WHERE id = ${merchantId}
  `;
  return { kind: "changed", value: {} };
}
