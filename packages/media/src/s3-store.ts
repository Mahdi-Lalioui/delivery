import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import { type MediaStore, validLength, validateKey, validatePut } from "./store.js";

function hasStatus(error: unknown, status: number): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === status;
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
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: input.key,
            Body: input.body,
            ContentLength: input.bytes,
            ChecksumSHA256: input.checksumSha256,
            ContentType: "application/octet-stream",
            CacheControl: "private, no-store",
            IfNoneMatch: "*",
          }),
        );
        return "stored";
      } catch (error) {
        if (hasStatus(error, 412)) return "exists";
        throw error;
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
