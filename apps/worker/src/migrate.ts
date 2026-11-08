import { runWorkerCommand } from "./command.js";
import { migrateWorker } from "./migrate-worker.js";

await runWorkerCommand("migrate", migrateWorker);
