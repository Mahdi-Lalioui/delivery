import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { createS3MediaStore } from "../src/index.ts";

const bucket = "synthetic-private";
const key = "quarantine/s3-store-fixture/body";
const data = Buffer.from("synthetic photo bytes");
const checksumSha256 = createHash("sha256").update(data).digest("base64");
const upload = () => ({ key, bytes: data.length, checksumSha256, body: Readable.from([data]) });

function harness(statusCode: number, code?: string, download?: Buffer) {
  const requests: { method: string; path: string; headers: Record<string, string> }[] = [];
  const requestHandler = {
    handle(request: (typeof requests)[number]) {
      requests.push(request);
      const payload = code
        ? Buffer.from(`<Error><Code>${code}</Code><Message>synthetic</Message></Error>`)
        : download;
      return Promise.resolve({
        response: {
          statusCode,
          headers: {
            "content-length": String(payload?.length ?? 0),
            "content-type": code ? "application/xml" : "application/octet-stream",
          },
          body: Readable.from(payload ? [payload] : []),
        },
      });
    },
    destroy() {},
  } satisfies S3ClientConfig["requestHandler"];
  const store = createS3MediaStore({
    bucket,
    config: {
      credentials: { accessKeyId: "synthetic-id", secretAccessKey: "synthetic-secret" },
      endpoint: "https://s3.invalid",
      region: "us-east-1",
      forcePathStyle: true,
      requestHandler,
    },
  });
  return { store, requests };
}

describe("S3 private media store", () => {
  it("sends an immutable private streamed upload with the declared integrity headers", async () => {
    const { store, requests } = harness(200);
    await expect(store.put(upload())).resolves.toBe("stored");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "PUT",
      path: `/${bucket}/${key}`,
      headers: {
        "cache-control": "private, no-store",
        "content-length": String(data.length),
        "content-type": "application/octet-stream",
        "if-none-match": "*",
        "x-amz-checksum-sha256": checksumSha256,
      },
    });
  });

  it("maps only a precondition failure to exists", async () => {
    const { store } = harness(412, "PreconditionFailed");
    await expect(store.put(upload())).resolves.toBe("exists");
    for (const [status, code] of [
      [403, "AccessDenied"],
      [409, "ConditionalRequestConflict"],
      [404, "NoSuchBucket"],
    ] as const) {
      const denied = harness(status, code);
      await expect(denied.store.put(upload())).rejects.toMatchObject({
        $metadata: { httpStatusCode: status },
      });
    }
  });

  it("streams downloads, maps only HTTP 404 to missing, and deletes idempotently", async () => {
    const found = harness(200, undefined, data);
    const downloaded = await found.store.get(key);
    expect(downloaded?.bytes).toBe(data.length);
    expect(downloaded && (await buffer(downloaded.body))).toEqual(data);
    const missing = harness(404, "NoSuchKey");
    await expect(missing.store.get(key)).resolves.toBeUndefined();
    await expect(missing.store.delete(key)).resolves.toBeUndefined();
    await expect(harness(204).store.delete(key)).resolves.toBeUndefined();
    const denied = harness(403, "AccessDenied");
    await expect(denied.store.get(key)).rejects.toMatchObject({
      $metadata: { httpStatusCode: 403 },
    });
    await expect(denied.store.delete(key)).rejects.toMatchObject({
      $metadata: { httpStatusCode: 403 },
    });
  });

  it("rejects invalid keys or declarations before sending an S3 request", async () => {
    const { store, requests } = harness(200);
    await expect(store.put({ ...upload(), key: "a/../b" })).rejects.toThrow(/key/i);
    await expect(store.put({ ...upload(), bytes: Number.NaN })).rejects.toThrow(/length/i);
    await expect(store.put({ ...upload(), checksumSha256: "invalid" })).rejects.toThrow(
      /checksum/i,
    );
    await expect(store.get("/outside")).rejects.toThrow(/key/i);
    await expect(store.delete("a/%2e%2e")).rejects.toThrow(/key/i);
    expect(requests).toHaveLength(0);
  });
});
