import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import { type MediaPut, type MediaStore, validLength, validateKey, validatePut } from "./store.js";

function hasStatus(error: unknown, status: number): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === status;
}

async function* checkedUploadChunks(
  input: MediaPut,
  verification: { hasStarted: boolean; isVerified: boolean },
): AsyncGenerator<Uint8Array> {
  verification.hasStarted = true;
  const hash = createHash("sha256");
  let remaining = input.bytes;
  let finalByte: Buffer | undefined;

  for await (const value of input.body) {
    const chunk: unknown = value;
    if (!(chunk instanceof Uint8Array)) throw new TypeError("Media upload must stream bytes");
    if (chunk.byteLength > remaining) throw new Error("Media object length mismatch");
    if (chunk.byteLength === 0) continue;

    remaining -= chunk.byteLength;
    hash.update(chunk);
    if (remaining > 0) {
      yield chunk;
      continue;
    }
    // Hold one copied byte so the service cannot accept the declared length before source EOF.
    finalByte = Buffer.from(chunk.subarray(-1));
    const prefix = chunk.subarray(0, -1);
    if (prefix.byteLength > 0) yield prefix;
  }

  if (!finalByte) throw new Error("Media object length mismatch");
  if (hash.digest("base64") !== input.checksumSha256) throw new Error("Media checksum mismatch");
  verification.isVerified = true;
  yield finalByte;
}

export function createS3MediaStore(options: {
  bucket: string;
  config: S3ClientConfig;
}): MediaStore {
  const { bucket, config } = options;
  // A request body is a one-shot stream. The caller supplies a fresh stream for retries.
  const client = new S3Client({ ...config, maxAttempts: 1 });

  return {
    async put(input) {
      validatePut(input);
      const verification = { hasStarted: false, isVerified: false };
      const body = Readable.from(checkedUploadChunks(input, verification), { objectMode: false });
      const controller = new AbortController();
      const abortOnFailure = (error: Error) => {
        controller.abort(error);
      };
      // The iterator handles source errors once reading starts, including errors during cleanup.
      input.body.once("error", (error) => {
        if (!verification.hasStarted) abortOnFailure(error);
      });
      body.once("error", abortOnFailure);

      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: input.key,
            Body: body,
            ContentLength: input.bytes,
            ChecksumSHA256: input.checksumSha256,
            ContentType: "application/octet-stream",
            CacheControl: "private, no-store",
            IfNoneMatch: "*",
          }),
          { abortSignal: controller.signal },
        );
        if (!verification.isVerified || !body.readableEnded) {
          throw new Error("S3 accepted an incomplete media upload");
        }
        return "stored";
      } catch (error) {
        if (hasStatus(error, 412)) return "exists";
        const uploadFailure: unknown = controller.signal.reason;
        if (uploadFailure instanceof Error) throw uploadFailure;
        throw error;
      } finally {
        if (!body.readableEnded) controller.abort();
        body.destroy();
        input.body.destroy();
      }
    },

    async get(key) {
      validateKey(key);
      try {
        const { Body, ContentLength } = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!(Body instanceof Readable)) throw new Error("S3 media response did not stream bytes");
        if (!validLength(ContentLength)) {
          Body.destroy();
          throw new Error("Invalid S3 media object length");
        }
        return { body: Body, bytes: ContentLength };
      } catch (error) {
        if (hasStatus(error, 404)) return undefined;
        throw error;
      }
    },

    async delete(key) {
      validateKey(key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        if (!hasStatus(error, 404)) throw error;
      }
    },
  };
}
