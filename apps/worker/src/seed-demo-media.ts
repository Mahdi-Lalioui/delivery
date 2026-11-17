import { openDatabase } from "@zaafran/db/database";
import { assertLocalDatabaseUrl } from "@zaafran/db/local-database";
import { createLocalMediaStore } from "@zaafran/media";
import { runWorkerCommand } from "./command.js";
import type { WorkerEnvironment } from "./command.js";
import { seedDemoMedia } from "./demo-media-seed.js";
import { workerLogger } from "./logger.js";

async function seedLocalDemoMedia(environment: WorkerEnvironment): Promise<void> {
  // D-022/D-023: demo photos go only into the local development database.
  assertLocalDatabaseUrl(environment.DATABASE_URL, "zaafran_dev");
  const database = openDatabase(environment.DATABASE_URL);
  try {
    const count = await seedDemoMedia({
      database,
      store: createLocalMediaStore({ root: environment.MEDIA_STORAGE_ROOT }),
      maxPixels: environment.MEDIA_MAX_DECODED_PIXELS,
      now: new Date(),
    });
    workerLogger.info({ count }, "Seeded demo dish photos");
  } finally {
    await database.close();
  }
}

await runWorkerCommand("seed-demo-media", seedLocalDemoMedia);
