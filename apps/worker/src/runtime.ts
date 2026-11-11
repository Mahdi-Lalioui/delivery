import type { DatabaseConnection } from "@zaafran/db/database";
import { createDiscoverySearchRepository } from "@zaafran/db/discovery-search";
import { createOrderRepository } from "@zaafran/db/orders";
import { createOrderQuoteRepository } from "@zaafran/db/order-quotes";
import { createPrivacyRepository } from "@zaafran/db/privacy";
import { createMediaRepository } from "@zaafran/db/media";
import { createLocalMediaStore, type MediaStore } from "@zaafran/media";
import type { RunnerOptions, TaskList } from "graphile-worker";
import { z } from "zod";
import { defaultMediaStorageRoot } from "./command.js";
import { createSearchRefreshJob } from "./discovery-search.js";
import { runJobEffectOnce } from "./effects.js";
import { defineJob } from "./jobs.js";
import { queueLogger } from "./logger.js";
import { createCropMediaJob } from "./media-crop.js";
import { createPrepareMediaJob } from "./media-prepare.js";
import { createPrivacyMediaPurgeJob } from "./privacy-media.js";
import { workerSchema } from "./migrate-worker.js";

const mediaPayload = z.strictObject({ mediaId: z.uuid(), phase: z.enum(["prepare", "crop"]) });
const cleanupPayload = z.strictObject({
  _cron: z.strictObject({ ts: z.iso.datetime(), backfilled: z.boolean() }).optional(),
});
const orderTimerPayload = z.strictObject({
  orderId: z.uuid(),
  action: z.enum(["expire", "release"]),
});
const watchdogIdentifier = "ops.watchdog";
const watchdogPayload = z.strictObject({ checkId: z.uuid() });

export function createWorkerOptions(
  connectionString: string,
  database: DatabaseConnection,
  media: { store: MediaStore; heicDecoderPath?: string | undefined } = {
    store: createLocalMediaStore({ root: defaultMediaStorageRoot() }),
  },
) {
  const privacy = createPrivacyRepository(database);
  const orders = createOrderRepository(database);
  const quotes = createOrderQuoteRepository(database);
  const mediaOptions = {
    repository: createMediaRepository(database),
    recordArtifact: privacy.recordApplicationMediaArtifact,
    ...media,
  };
  const prepare = createPrepareMediaJob(mediaOptions);
  const crop = createCropMediaJob(mediaOptions);
  const taskList = {
    "media.process": defineJob(mediaPayload, (payload) =>
      payload.phase === "prepare" ? prepare(payload) : crop(payload),
    ),
    "privacy.purge_media": createPrivacyMediaPurgeJob({
      repository: privacy,
      store: media.store,
    }),
    privacy_cleanup: defineJob(cleanupPayload, async () => {
      const now = new Date();
      await privacy.pruneDeletionState(now);
      await quotes.pruneExpired(now);
    }),
    "order.timer": defineJob(orderTimerPayload, ({ orderId, action }) =>
      orders.runTimer(orderId, action, new Date()),
    ),
    search_refresh: createSearchRefreshJob(createDiscoverySearchRepository(database)),
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
    crontab: "* * * * * search_refresh\n*/5 * * * * privacy_cleanup",
    // Graphile Worker drains these queues before closing its pool on shutdown.
    preset: { worker: { completeJobBatchDelay: 0, failJobBatchDelay: 0 } },
  } satisfies RunnerOptions;
}
