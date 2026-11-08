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
const upload = () => ({
  key,
  bytes: data.length,
  checksumSha256,
  body: Readable.from([data.subarray(0, 5), data.subarray(5)]),
});

async function collectUpload(body: unknown, sent: Uint8Array[]): Promise<void> {
  if (!(body instanceof Readable)) throw new Error("Expected a streaming upload");
  for await (const value of body) {
    const chunk: unknown = value;
    if (!(chunk instanceof Uint8Array)) throw new Error("Expected streaming bytes");
    sent.push(chunk);
  }
}

function harness(
  statusCode: number,
  {
    code,
    download,
    consumeUpload = collectUpload,
  }: {
    code?: string;
    download?: Buffer;
    consumeUpload?: false | typeof collectUpload;
  } = {},
) {
  const requests: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: unknown;
  }[] = [];
  const sent: Uint8Array[] = [];
  const requestHandler = {
    async handle(request: (typeof requests)[number]) {
      requests.push(request);
      if (request.method === "PUT" && statusCode === 200 && consumeUpload) {
        await consumeUpload(request.body, sent);
      }
      const payload = code
        ? Buffer.from(`<Error><Code>${code}</Code><Message>synthetic</Message></Error>`)
        : download;
      return {
        response: {
          statusCode,
          headers: {
            "content-length": String(payload?.length ?? 0),
            "content-type": code ? "application/xml" : "application/octet-stream",
          },
          body: Readable.from(payload ? [payload] : []),
        },
      };
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
  return { store, requests, sent };
}

describe("S3 private media store", () => {
  it("sends an immutable private streamed upload with the declared integrity headers", async () => {
    const { store, requests, sent } = harness(200);
    await expect(store.put(upload())).resolves.toBe("stored");
    expect(Buffer.concat(sent)).toEqual(data);
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

  it("withholds the final declared bytes when the stream contains extra bytes", async () => {
    const { store, sent } = harness(200);
    const body = Readable.from([data.subarray(0, 1), data.subarray(1), Buffer.from("excess")]);

    await expect(store.put({ ...upload(), body })).rejects.toThrow(/length/i);
    expect(Buffer.concat(sent).byteLength).toBeLessThan(data.byteLength);
  });

  it("rejects a truncated body before the service can accept it", async () => {
    const { store, sent } = harness(200);
    const body = Readable.from([data.subarray(0, -1)]);

    await expect(store.put({ ...upload(), body })).rejects.toThrow(/length/i);
    expect(Buffer.concat(sent).byteLength).toBeLessThan(data.byteLength);
  });

  it("withholds the final declared bytes when the source fails instead of reaching EOF", async () => {
    const { store, sent } = harness(200);
    function* interrupted() {
      yield data;
      throw new Error("source interrupted");
    }

    await expect(store.put({ ...upload(), body: Readable.from(interrupted()) })).rejects.toThrow(
      "source interrupted",
    );
    expect(Buffer.concat(sent).byteLength).toBeLessThan(data.byteLength);
  });

  it("withholds the final bytes when the source checksum is wrong", async () => {
    const { store, sent } = harness(200);
    const wrongChecksum = createHash("sha256").update("other data").digest("base64");

    await expect(store.put({ ...upload(), checksumSha256: wrongChecksum })).rejects.toThrow(
      /checksum/i,
    );
    expect(Buffer.concat(sent).byteLength).toBeLessThan(data.byteLength);
  });

  it("does not report success if the service replies before validating the upload", async () => {
    const { store, sent } = harness(200, { consumeUpload: false });
    const input = upload();

    await expect(store.put(input)).rejects.toThrow(/incomplete media upload/i);
    expect(sent).toEqual([]);
    expect(input.body.destroyed).toBe(true);
  });

  it("rejects success after consuming only a prefix of a verified upload", async () => {
    const continueSource = Promise.withResolvers<undefined>();
    let bufferedBytes = 0;
    const prefix = data.subarray(0, 5);
    const { store, sent } = harness(200, {
      async consumeUpload(outbound, chunks) {
        if (!(outbound instanceof Readable)) throw new Error("Expected a streaming upload");
        const next = await outbound.iterator({ destroyOnReturn: false }).next();
        const first: unknown = next.value;
        if (!(first instanceof Uint8Array)) throw new Error("Expected the initial upload bytes");
        chunks.push(first);
        continueSource.resolve(undefined);
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        bufferedBytes = outbound.readableLength;
      },
    });
    async function* source() {
      yield prefix;
      await continueSource.promise;
      yield data.subarray(prefix.length);
    }

    await expect(store.put({ ...upload(), body: Readable.from(source()) })).rejects.toThrow(
      /incomplete media upload/i,
    );
    expect(Buffer.concat(sent)).toEqual(prefix);
    expect(bufferedBytes).toBeGreaterThan(0);
  });

  it("maps only a precondition failure to exists", async () => {
    const { store } = harness(412, { code: "PreconditionFailed" });
    const input = upload();
    await expect(store.put(input)).resolves.toBe("exists");
    expect(input.body.destroyed).toBe(true);
    for (const [status, code] of [
      [403, "AccessDenied"],
      [409, "ConditionalRequestConflict"],
      [404, "NoSuchBucket"],
    ] as const) {
      const denied = harness(status, { code });
      await expect(denied.store.put(upload())).rejects.toMatchObject({
        $metadata: { httpStatusCode: status },
      });
    }
  });

  it("streams downloads, maps only HTTP 404 to missing, and deletes idempotently", async () => {
    const found = harness(200, { download: data });
    const downloaded = await found.store.get(key);
    expect(downloaded?.bytes).toBe(data.length);
    expect(downloaded && (await buffer(downloaded.body))).toEqual(data);
    const missing = harness(404, { code: "NoSuchKey" });
    await expect(missing.store.get(key)).resolves.toBeUndefined();
    await expect(missing.store.delete(key)).resolves.toBeUndefined();
    await expect(harness(204).store.delete(key)).resolves.toBeUndefined();
    const denied = harness(403, { code: "AccessDenied" });
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
