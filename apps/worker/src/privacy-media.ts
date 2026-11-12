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

export function createDeliveryProofPurgeJob({
  repository,
  store,
}: {
  repository: {
    claimDeliveryProof(mediaId: string): Promise<{ keys: readonly string[] } | undefined>;
    finishDeliveryProof(mediaId: string): Promise<void>;
  };
  store: Pick<MediaStore, "delete">;
}) {
  return defineJob(z.strictObject({ mediaId: z.uuid() }), async ({ mediaId }) => {
    const proof = await repository.claimDeliveryProof(mediaId);
    if (!proof) return;
    for (const key of proof.keys) await store.delete(key);
    await repository.finishDeliveryProof(mediaId);
  });
}
