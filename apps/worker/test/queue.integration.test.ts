import { once } from "node:events";
import { run, runOnce } from "graphile-worker";
import { expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { migrateWorker } from "../src/migrate-worker.ts";
import { createWorkerOptions } from "../src/runtime.ts";

const database = registerTestDatabase();

test("[M0-7] the migrated queue processes duplicate watchdog jobs into one health check", async () => {
  const connection = database.get();
  const databaseUrl = database.url();
  await migrateWorker(databaseUrl);

  const [migration] = await connection.sql<{ revision: number }[]>`
    select max(id) as revision from graphile_worker.migrations
  `;
  expect(migration?.revision).toBe(20);

  const checkId = "654abdc4-6f5f-4e38-9a89-f1fd71d0db2a";
  for (let attempt = 0; attempt < 2; attempt++) {
    await connection.sql`
      select graphile_worker.add_job('ops.watchdog', json_build_object('checkId', ${checkId}::text))
    `;
  }

  await runOnce({ ...createWorkerOptions(databaseUrl, connection), noHandleSignals: true });

  expect(await connection.sql`select id from graphile_worker.jobs`).toHaveLength(0);
  const effects = await connection.sql`
    select effect_key from job_effects where task_identifier = 'ops.watchdog'
  `;
  expect([...effects]).toEqual([{ effect_key: checkId }]);
});

test("[M0-7] a graceful stop persists an in-progress watchdog job's completion", async () => {
  const connection = database.get();
  const checkId = "87364915-64d1-49af-af73-4818c0dfc824";
  const runner = await run({
    ...createWorkerOptions(database.url(), connection),
    noHandleSignals: true,
  });
  let stopped: Promise<void> | undefined;

  try {
    await connection.sql.begin(async (transaction) => {
      await transaction`lock table public.job_effects in access exclusive mode`;
      await Promise.all([
        once(runner.events, "job:start", { signal: AbortSignal.timeout(3_000) }),
        connection.sql`
          select graphile_worker.add_job(
            'ops.watchdog', json_build_object('checkId', ${checkId}::text)
          )
        `,
      ]);
      stopped = runner.stop();
    });
  } finally {
    await (stopped ?? runner.stop());
    await runner.promise;
  }

  const effects = await connection.sql`
    select effect_key from public.job_effects where effect_key = ${checkId}
  `;
  expect([...effects]).toEqual([{ effect_key: checkId }]);
  expect(await connection.sql`select id from graphile_worker.jobs`).toHaveLength(0);
});
