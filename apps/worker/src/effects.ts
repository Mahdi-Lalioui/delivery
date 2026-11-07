import type { DatabaseConnection } from "@zaafran/db/database";
import type { TransactionSql } from "postgres";

type EffectResult<Result> = { applied: false } | { applied: true; result: Result };

export function runJobEffectOnce<Result>({
  database,
  taskIdentifier,
  effectKey,
  apply,
}: {
  database: DatabaseConnection;
  taskIdentifier: string;
  effectKey: string;
  apply: (transaction: TransactionSql) => Promise<Result>;
}): Promise<EffectResult<Result>> {
  return database.sql.begin<EffectResult<Result>>(async (transaction) => {
    const claimed = await transaction`
      insert into public.job_effects (task_identifier, effect_key)
      values (${taskIdentifier}, ${effectKey})
      on conflict (task_identifier, effect_key) do nothing
      returning 1
    `;
    if (claimed.length === 0) return { applied: false };

    return { applied: true, result: await apply(transaction) };
  });
}
