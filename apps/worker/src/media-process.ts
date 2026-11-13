import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { photoRatios } from "@zaafran/contracts/media";
import type { DatabaseConnection } from "@zaafran/db/database";
import { createMediaProcessingRepository } from "@zaafran/db/media-processing";
import type { ProcessingUpload, RejectionReason } from "@zaafran/db/media-processing";
import type { MediaStore } from "@zaafran/media";
import { cropRectangle } from "./media-crop.js";
import { decodeUpload } from "./media-decode.js";
import type { DecodeResult, RawImage } from "./media-decode.js";
import { previewStorageKey, variantStorageKey } from "./media-keys.js";
import { renderCropPreview } from "./media-preview.js";
import { renderVariants } from "./media-variants.js";

export interface MediaProcessPayload {
  readonly mediaId: string;
  readonly phase: "prepare" | "publish";
}

interface ProcessorOptions {
  readonly database: DatabaseConnection;
  readonly store: MediaStore;
  readonly maxPixels: number;
}

type Rejection = Extract<DecodeResult, { kind: "rejected" }>["reason"];

const rejectionReasons = {
  undecodable: "invalid_image",
  type_mismatch: "content_type_mismatch",
  too_many_pixels: "image_too_large",
} as const satisfies Record<Rejection, RejectionReason>;

async function putBuffer(store: MediaStore, key: string, data: Buffer) {
  const checksumSha256 = createHash("sha256").update(data).digest("base64");
  await store.put({ key, body: Readable.from([data]), bytes: data.length, checksumSha256 });
}

async function readOriginal(store: MediaStore, key: string): Promise<Buffer> {
  const object = await store.get(key);
  if (!object) throw new Error("The quarantined original is missing");
  return Buffer.concat(await object.body.toArray());
}

/** Prepares or publishes one photo. Each phase is a no-op once its state has moved on. */
export function createMediaProcessor({ database, store, maxPixels }: ProcessorOptions) {
  const media = createMediaProcessingRepository(database);

  async function decode(upload: ProcessingUpload): Promise<RawImage | undefined> {
    if (upload.contentType === "image/heic") {
      // TODO(M2-6): decode HEVC HEIC through the bounded libheif helper (D-007).
      throw new Error("HEIC decoding needs the bounded libheif helper");
    }
    const original = await readOriginal(store, upload.quarantineKey);
    const result = await decodeUpload(original, { contentType: upload.contentType, maxPixels });
    if (result.kind === "decoded") return result;
    const reason = rejectionReasons[result.reason];
    if ((await media.reject({ mediaId: upload.mediaId, reason })) === "rejected") {
      await store.delete(upload.quarantineKey);
    }
    return undefined;
  }

  async function prepare(upload: ProcessingUpload) {
    const image = await decode(upload);
    if (!image) return;
    const preview = await renderCropPreview(image);
    const previewKey = previewStorageKey(upload.mediaId);
    await putBuffer(store, previewKey, preview.data);
    await media.recordPreview({ mediaId: upload.mediaId, previewKey, ...preview });
  }

  async function publish(upload: ProcessingUpload) {
    if (!upload.crop) throw new Error("A processing photo must have a crop");
    const image = await decode(upload);
    if (!image) return;
    const ratio = photoRatios[upload.kind];
    const rendered = await renderVariants(image, cropRectangle(image, ratio, upload.crop), ratio);
    const variants = [];
    for (const { data, ...variant } of rendered.variants) {
      const storageKey = variantStorageKey({
        ...variant,
        mediaId: upload.mediaId,
        kind: upload.kind,
      });
      await putBuffer(store, storageKey, data);
      variants.push({ ...variant, storageKey });
    }
    const { thumbhash } = rendered;
    const result = await media.publish({ mediaId: upload.mediaId, thumbhash, variants });
    if (result === "incomplete") throw new Error("Every variant must exist before publishing");
    if (result === "published") await store.delete(upload.quarantineKey);
  }

  async function advance(upload: ProcessingUpload, phase: MediaProcessPayload["phase"]) {
    if (phase === "prepare" && upload.status === "preparing") await prepare(upload);
    if (phase === "publish" && upload.status === "processing") await publish(upload);
  }

  return async ({ mediaId, phase }: MediaProcessPayload): Promise<void> => {
    const upload = await media.read(mediaId);
    if (!upload) return;
    await advance(upload, phase);
    // A retry after an interruption between settling and deletion finishes the cleanup.
    if (upload.status === "ready" || upload.status === "rejected") {
      await store.delete(upload.quarantineKey);
    }
  };
}
