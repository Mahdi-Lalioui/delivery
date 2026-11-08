import { runMigrations } from "graphile-worker";
import { queueLogger } from "./logger.js";

export const workerSchema = "graphile_worker";

export function migrateWorker(connectionString: string): Promise<void> {
  return runMigrations({ connectionString, schema: workerSchema, logger: queueLogger });
}
