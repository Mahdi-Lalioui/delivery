import { createHash } from "node:crypto";
import { photoUploadMaximumBytes } from "@zaafran/contracts/media";
import type { MediaStore } from "@zaafran/media";
import { z } from "zod";

const originalLength = z.int().positive().max(photoUploadMaximumBytes);
type Original = {
  readonly bytes: number;
  readonly digest: Uint8Array;
  readonly quarantineKey: string;
};

export async function readOriginal(store: MediaStore, source: Original): Promise<Buffer> {
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
