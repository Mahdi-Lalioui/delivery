import type { DatabaseConnection } from "@zaafran/db/database";
import { createMediaRepository } from "@zaafran/db/media";
import { createLocalMediaStore, type MediaStore } from "@zaafran/media";
import type { RunnerOptions, TaskList } from "graphile-worker";
import { z } from "zod";
import { defaultMediaStorageRoot } from "./command.js";
import { runJobEffectOnce } from "./effects.js";
import { defineJob } from "./jobs.js";
import { queueLogger } from "./logger.js";
import { createPrepareMediaJob } from "./media-prepare.js";
import { workerSchema } from "./migrate-worker.js";

const watchdogIdentifier = "ops.watchdog";
const watchdogPayload = z.strictObject({ checkId: z.uuid() });

export function createWorkerOptions(
  connectionString: string,
  database: DatabaseConnection,
  media: { store: MediaStore; heicDecoderPath?: string | undefined } = {
    store: createLocalMediaStore({ root: defaultMediaStorageRoot() }),
  },
) {
  const taskList = {
    "media.process": createPrepareMediaJob({
      repository: createMediaRepository(database),
      ...media,
    }),
    [watchdogIdentifier]: defineJob(watchdogPayload, async ({ checkId }) => {
      await runJobEffectOnce({
        database,
        taskIdentifier: watchdogIdentifier,
        effectKey: checkId,
        apply: async (transaction) => {
          await transaction`select postgis_version()`;
        },
      });
    }),
  } satisfies TaskList;

  return {
    connectionString,
    taskList,
    schema: workerSchema,
    logger: queueLogger,
    crontab: "",
    // Graphile Worker drains these queues before closing its pool on shutdown.
    preset: { worker: { completeJobBatchDelay: 0, failJobBatchDelay: 0 } },
  } satisfies RunnerOptions;
}
