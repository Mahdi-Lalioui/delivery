import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { createMediaRepository } from "@zaafran/db/media";
import { preparePhoto, type MediaStore } from "@zaafran/media";
import { z } from "zod";
import { defineJob } from "./jobs.js";
import { readOriginal } from "./media-original.js";

const preparePayload = z.strictObject({ mediaId: z.uuid(), phase: z.literal("prepare") });
type PreparationRepository = Pick<
  ReturnType<typeof createMediaRepository>,
  "findPreparation" | "completePreparation"
>;

interface PrepareMediaOptions {
  readonly repository: PreparationRepository;
  readonly store: MediaStore;
  readonly recordArtifact: (mediaId: string, key: string) => Promise<void>;
  readonly heicDecoderPath?: string | undefined;
}

async function writePreview(
  { store, recordArtifact }: Pick<PrepareMediaOptions, "store" | "recordArtifact">,
  mediaId: string,
  bytes: Buffer,
): Promise<string> {
  const digest = createHash("sha256").update(bytes).digest();
  // A retry can reuse the same object while different encoders cannot overwrite it.
  const key = `previews/${mediaId}/${digest.toString("hex")}.webp`;
  await recordArtifact(mediaId, key);
  await store.put({
    key,
    body: Readable.from(bytes),
    bytes: bytes.length,
    checksumSha256: digest.toString("base64"),
  });
  return key;
}

export function createPrepareMediaJob({
  repository,
  store,
  heicDecoderPath,
  recordArtifact,
}: PrepareMediaOptions) {
  return defineJob(preparePayload, async (payload) => {
    const mediaId = payload.mediaId.toLowerCase();
    const source = await repository.findPreparation(mediaId);
    if (!source) return;
    const { quarantineKey } = source;
    if (source.status === "rejected") {
      await store.delete(quarantineKey);
      return;
    }

    const bytes = await readOriginal(store, source);
    const result = await preparePhoto({
      bytes,
      contentType: source.contentType,
      ...(heicDecoderPath === undefined ? {} : { heicDecoderPath }),
    });
    if (result.status === "rejected") {
      if (await repository.completePreparation({ mediaId, quarantineKey, result })) {
        await store.delete(quarantineKey);
      }
      return;
    }

    const { width, height } = result.preview;
    const previewKey = await writePreview({ store, recordArtifact }, mediaId, result.preview.bytes);
    await repository.completePreparation({
      mediaId,
      quarantineKey,
      result: { status: "awaiting_crop", previewKey, width, height },
    });
  });
}
