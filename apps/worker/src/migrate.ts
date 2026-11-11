import { runWorkerCommand } from "./command.js";
import { migrateWorker } from "./migrate-worker.js";

await runWorkerCommand("migrate", ({ DATABASE_URL }) => migrateWorker(DATABASE_URL));
