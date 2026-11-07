import { beforeAll, beforeEach, expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { runJobEffectOnce } from "../src/effects.ts";

const testDatabase = registerTestDatabase();

beforeAll(async () => {
  await testDatabase.get().sql`create table worker_effect_probe (marker text not null)`;
});

beforeEach(async () => {
  await testDatabase.get().sql`truncate worker_effect_probe`;
});

test("[JOB-01] concurrent attempts for one effect commit one row", async () => {
  const database = testDatabase.get();
  const effect = {
    database,
    taskIdentifier: "notify.send",
    effectKey: "order-41",
  };

  const results = await Promise.all(
    ["first", "second"].map((marker) =>
      runJobEffectOnce({
        ...effect,
        apply: async (transaction) => {
          await transaction`insert into worker_effect_probe values (${marker})`;
          return marker;
        },
      }),
    ),
  );

  expect(results).toContainEqual({ applied: false });
  const rows = await database.sql<{ marker: string }[]>`select marker from worker_effect_probe`;
  expect(rows).toHaveLength(1);
  expect(results).toContainEqual({ applied: true, result: rows[0]?.marker });
});

test("[JOB-01] a failed effect rolls back its write and can retry the same key", async () => {
  const database = testDatabase.get();
  const effect = {
    database,
    taskIdentifier: "notify.send",
    effectKey: "order-44",
  };

  await expect(
    runJobEffectOnce({
      ...effect,
      apply: async (transaction) => {
        await transaction`insert into worker_effect_probe values ('failed')`;
        throw new Error("effect failed after writing");
      },
    }),
  ).rejects.toThrow("effect failed after writing");
  expect(await database.sql`select marker from worker_effect_probe`).toHaveLength(0);

  const result = await runJobEffectOnce({
    ...effect,
    apply: async (transaction) => {
      await transaction`insert into worker_effect_probe values ('retried')`;
      return "stored";
    },
  });

  expect(result).toEqual({ applied: true, result: "stored" });
  const rows = await database.sql`select marker from worker_effect_probe`;
  expect([...rows]).toEqual([{ marker: "retried" }]);
});

test("[JOB-01] effect claims distinguish both task identifier and effect key", async () => {
  const database = testDatabase.get();

  for (const { taskIdentifier, effectKey, marker } of [
    { taskIdentifier: "notify.send", effectKey: "order-42", marker: "first" },
    { taskIdentifier: "notify.send", effectKey: "order-43", marker: "other-key" },
    { taskIdentifier: "order.ratingPrompt", effectKey: "order-42", marker: "other-task" },
  ]) {
    const result = await runJobEffectOnce({
      database,
      taskIdentifier,
      effectKey,
      apply: async (transaction) => {
        await transaction`insert into worker_effect_probe values (${marker})`;
      },
    });

    expect(result).toEqual({ applied: true, result: undefined });
  }

  const rows = await database.sql`select marker from worker_effect_probe order by marker`;
  expect([...rows]).toEqual([
    { marker: "first" },
    { marker: "other-key" },
    { marker: "other-task" },
  ]);
});
