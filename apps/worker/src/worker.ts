import { openDatabase } from "@zaafran/db/database";
import { createLocalMediaStore } from "@zaafran/media";
import { run } from "graphile-worker";
import { runWorkerCommand } from "./command.js";
import { workerLogger } from "./logger.js";
import { createWorkerOptions } from "./runtime.js";

async function serveWorker(
  databaseUrl: string,
  media: Parameters<typeof createWorkerOptions>[2],
): Promise<void> {
  const database = openDatabase(databaseUrl);
  const shutdown = Promise.withResolvers<"signal">();
  const requestShutdown = () => {
    shutdown.resolve("signal");
  };
  process.on("SIGINT", requestShutdown);
  process.on("SIGTERM", requestShutdown);

  try {
    const runner = await run({
      ...createWorkerOptions(databaseUrl, database, media),
      noHandleSignals: true,
    });
    runner.events.on("job:failed", ({ job }) => {
      workerLogger.error(
        { jobId: job.id, taskIdentifier: job.task_identifier, attempts: job.attempts },
        "Job exhausted its retries",
      );
    });

    const completion = await Promise.race([runner.promise, shutdown.promise]);
    if (completion === "signal") await runner.stop().finally(() => runner.promise);
  } finally {
    process.off("SIGINT", requestShutdown);
    process.off("SIGTERM", requestShutdown);
    await database.close();
  }
}

await runWorkerCommand("start", ({ DATABASE_URL, MEDIA_STORAGE_ROOT, HEIC_DECODER_PATH }) =>
  serveWorker(DATABASE_URL, {
    store: createLocalMediaStore({ root: MEDIA_STORAGE_ROOT }),
    heicDecoderPath: HEIC_DECODER_PATH,
  }),
);
