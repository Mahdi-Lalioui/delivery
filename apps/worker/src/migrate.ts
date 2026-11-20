import postgres from "postgres";
import { runWorkerCommand } from "./command.js";
import { migrateWorker } from "./migrate-worker.js";

await runWorkerCommand("migrate", async ({ DATABASE_URL }) => {
  await migrateWorker(DATABASE_URL);
  if (process.env.AWID_SPLIT_DATABASE_ROLES !== "1") return;

  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    await sql.begin(async (transaction) => {
      await transaction`REVOKE INSERT, UPDATE, DELETE ON graphile_worker.migrations FROM awid_runtime`;
      for (const name of [
        "_private_job_queues",
        "_private_jobs",
        "_private_known_crontabs",
        "_private_tasks",
      ]) {
        const table = transaction("graphile_worker." + name);
        await transaction`DROP POLICY IF EXISTS awid_runtime_queue ON ${table}`;
        await transaction`
          CREATE POLICY awid_runtime_queue ON ${table} TO awid_runtime
          USING (true) WITH CHECK (true)
        `;
      }
    });
  } finally {
    await sql.end();
  }
});
