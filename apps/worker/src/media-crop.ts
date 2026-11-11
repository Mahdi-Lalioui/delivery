import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { createMediaRepository, MediaStoredVariant } from "@zaafran/db/media";
import { cropPhoto, type MediaStore } from "@zaafran/media";
import { z } from "zod";
import { defineJob } from "./jobs.js";
import { readOriginal } from "./media-original.js";

const cropPayload = z.strictObject({ mediaId: z.uuid(), phase: z.literal("crop") });

interface CropMediaOptions {
  readonly repository: Pick<
    ReturnType<typeof createMediaRepository>,
    "findCropWork" | "completeCrop"
  >;
  readonly store: MediaStore;
  readonly recordArtifact: (mediaId: string, key: string) => Promise<void>;
  readonly heicDecoderPath?: string | undefined;
}

type EncodedVariant = Omit<MediaStoredVariant, "bytes" | "key"> & { bytes: Buffer };

async function storeVariant(
  { store, recordArtifact }: Pick<CropMediaOptions, "store" | "recordArtifact">,
  mediaId: string,
  variant: EncodedVariant,
) {
  const { format, width, height, bytes } = variant;
  const digest = createHash("sha256").update(bytes).digest();
  const key = `variants/${mediaId}/${String(width)}-${digest.toString("hex")}.${format}`;
  await recordArtifact(mediaId, key);
  await store.put({
    key,
    body: Readable.from([bytes]),
    bytes: bytes.length,
    checksumSha256: digest.toString("base64"),
  });
  return { key, format, width, height, bytes: bytes.length };
}

export function createCropMediaJob({
  repository,
  store,
  heicDecoderPath,
  recordArtifact,
}: CropMediaOptions) {
  return defineJob(cropPayload, async (payload) => {
    const mediaId = payload.mediaId.toLowerCase();
    const source = await repository.findCropWork(mediaId);
    if (!source) return;
    const { quarantineKey, previewKey } = source;
    if (source.status === "processing") {
      const bytes = await readOriginal(store, source);
      const result = await cropPhoto({
        bytes,
        contentType: source.contentType,
        kind: source.kind,
        crop: source.crop,
        ...(heicDecoderPath === undefined ? {} : { heicDecoderPath }),
      });
      // Preparation already proved the original was decodable. Retain it for retry on divergence.
      if (result.status !== "cropped") throw new Error("Prepared original could not be cropped");
      const variants: MediaStoredVariant[] = [];
      for (const variant of result.variants)
        variants.push(await storeVariant({ store, recordArtifact }, mediaId, variant));
      if (
        !(await repository.completeCrop({
          mediaId,
          quarantineKey,
          result: { status: "ready", variants, thumbhash: result.thumbhash },
        }))
      )
        return;
    }
    await store.delete(quarantineKey);
    await store.delete(previewKey);
  });
}
