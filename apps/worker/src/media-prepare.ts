import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { photoUploadMaximumBytes } from "@zaafran/contracts/media";
import type { createMediaRepository, MediaPreparationSource } from "@zaafran/db/media";
import { preparePhoto, type MediaStore } from "@zaafran/media";
import { z } from "zod";
import { defineJob } from "./jobs.js";

const preparePayload = z.strictObject({ mediaId: z.uuid(), phase: z.literal("prepare") });
const originalLength = z.int().positive().max(photoUploadMaximumBytes);

type Original = Extract<MediaPreparationSource, { status: "preparing" }>;
type PreparationRepository = Pick<
  ReturnType<typeof createMediaRepository>,
  "findPreparation" | "completePreparation"
>;

interface PrepareMediaOptions {
  readonly repository: PreparationRepository;
  readonly store: MediaStore;
  readonly heicDecoderPath?: string | undefined;
}

async function readOriginal(store: MediaStore, source: Original): Promise<Buffer> {
  const { bytes, digest, quarantineKey } = source;
  if (!originalLength.safeParse(bytes).success) {
    throw new Error("Invalid quarantined photo receipt length");
  }
  const object = await store.get(quarantineKey);
  if (!object) throw new Error("Quarantined photo is unavailable");

  try {
    if (object.bytes !== bytes) throw new Error("Quarantined photo length mismatch");
    const photo = Buffer.alloc(bytes);
    const hash = createHash("sha256");
    let offset = 0;
    for await (const value of object.body) {
      const chunk: unknown = value;
      if (!(chunk instanceof Uint8Array) || chunk.byteLength > bytes - offset) {
        throw new Error("Invalid quarantined photo stream");
      }
      photo.set(chunk, offset);
      hash.update(chunk);
      offset += chunk.byteLength;
    }
    if (offset !== bytes) throw new Error("Quarantined photo length mismatch");
    if (!hash.digest().equals(digest)) throw new Error("Quarantined photo checksum mismatch");
    return photo;
  } finally {
    object.body.destroy();
  }
}

async function writePreview(store: MediaStore, mediaId: string, bytes: Buffer): Promise<string> {
  const digest = createHash("sha256").update(bytes).digest();
  // A retry can reuse the same object while different encoders cannot overwrite it.
  const key = `previews/${mediaId}/${digest.toString("hex")}.webp`;
  await store.put({
    key,
    body: Readable.from(bytes),
    bytes: bytes.length,
    checksumSha256: digest.toString("base64"),
  });
  return key;
}

export function createPrepareMediaJob({ repository, store, heicDecoderPath }: PrepareMediaOptions) {
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
    const previewKey = await writePreview(store, mediaId, result.preview.bytes);
    await repository.completePreparation({
      mediaId,
      quarantineKey,
      result: { status: "awaiting_crop", previewKey, width, height },
    });
  });
}
