import type { MediaStore } from "@zaafran/media";
import { z } from "zod";
import { defineJob } from "./jobs.js";

interface MediaErasureRepository {
  findErasureMedia(
    userId: string,
  ): Promise<readonly { mediaId: string; keys: readonly string[] }[]>;
  finishErasureMedia(input: { userId: string; mediaId: string }): Promise<void>;
}

const payload = z.strictObject({ userId: z.uuid() });

export function createPrivacyMediaPurgeJob({
  repository,
  store,
}: {
  repository: MediaErasureRepository;
  store: Pick<MediaStore, "delete">;
}) {
  return defineJob(payload, async ({ userId }) => {
    for (;;) {
      const batch = await repository.findErasureMedia(userId);
      if (batch.length === 0) return;
      for (const { mediaId, keys } of batch) {
        for (const key of keys) await store.delete(key);
        await repository.finishErasureMedia({ userId, mediaId });
      }
    }
  });
}
