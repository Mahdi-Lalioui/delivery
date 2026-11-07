import type { Readable } from "node:stream";

export interface MediaPut {
  readonly key: string;
  readonly body: Readable;
  readonly bytes: number;
  readonly checksumSha256: string;
}

export interface MediaObject {
  readonly body: Readable;
  readonly bytes: number;
}

export interface MediaStore {
  put(input: MediaPut): Promise<"stored" | "exists">;
  get(key: string): Promise<MediaObject | undefined>;
  delete(key: string): Promise<void>;
}

const keySegment = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/u;

export function validateKey(key: string): void {
  if (key.length > 512 || !key.split("/").every((segment) => keySegment.test(segment))) {
    throw new TypeError("Invalid media object key");
  }
}

export function validLength(bytes: unknown): bytes is number {
  return typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes > 0;
}

export function validatePut({ key, bytes, checksumSha256 }: MediaPut): void {
  validateKey(key);
  if (!validLength(bytes)) {
    throw new TypeError("Invalid media object length");
  }

  if (checksumSha256.length !== 44) {
    throw new TypeError("Invalid SHA-256 checksum");
  }
  const decoded = Buffer.from(checksumSha256, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== checksumSha256) {
    throw new TypeError("Invalid SHA-256 checksum");
  }
}
