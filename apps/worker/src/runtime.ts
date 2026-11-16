import type { DatabaseConnection } from "@zaafran/db/database";
import type { MediaStore } from "@zaafran/media";
import type { RunnerOptions, TaskList } from "graphile-worker";
import { z } from "zod";
import { runJobEffectOnce } from "./effects.js";
import { defineJob } from "./jobs.js";
import { queueLogger } from "./logger.js";
import { createMediaProcessor } from "./media-process.js";
import { workerSchema } from "./migrate-worker.js";
import { createReviewNotifier, reviewNoticeIdentifier } from "./review-notice.js";
import type { SmsSender } from "./sms.js";

const watchdogIdentifier = "ops.watchdog";
const watchdogPayload = z.strictObject({ checkId: z.uuid() });
const mediaPayload = z.strictObject({ mediaId: z.uuid(), phase: z.enum(["prepare", "publish"]) });
const reviewNoticePayload = z.strictObject({ merchantId: z.uuid() });

interface MediaOptions {
  readonly store: MediaStore;
  readonly maxPixels: number;
}

interface WorkerAdapters {
  readonly media: MediaOptions;
  readonly sms: SmsSender;
}

export function createWorkerOptions(
  connectionString: string,
  database: DatabaseConnection,
  { media, sms }: WorkerAdapters,
) {
  const taskList = {
    "media.process": defineJob(mediaPayload, createMediaProcessor({ database, ...media })),
    [reviewNoticeIdentifier]: defineJob(
      reviewNoticePayload,
      createReviewNotifier({ database, sms }),
    ),
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
