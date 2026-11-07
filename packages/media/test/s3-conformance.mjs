import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { HeadBucketCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { createS3MediaStore } from "@zaafran/media";

const endpoint = "http://127.0.0.1:8333";
const bucket = "zaafran-media-test";
const config = {
  endpoint,
  region: "us-east-1",
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: { accessKeyId: "synthetic-media-id", secretAccessKey: "synthetic-media-secret" },
};

const checksum = (body) => createHash("sha256").update(body).digest("base64");
const hasStatus = (status) => (error) =>
  error instanceof S3ServiceException && error.$metadata.httpStatusCode === status;

async function waitForBucket(s3) {
  const command = new HeadBucketCommand({ Bucket: bucket });
  for (let attempt = 0; attempt < 79; attempt += 1) {
    try {
      await s3.send(command);
      return;
    } catch {
      await setTimeout(250);
    }
  }
  await s3.send(command);
}

test("private SeaweedFS storage preserves immutable, checksum-verified object bytes", async () => {
  const s3 = new S3Client(config);
  try {
    await waitForBucket(s3);
  } finally {
    s3.destroy();
  }
  const store = createS3MediaStore({ bucket, config });
  const key = `quarantine/${randomUUID()}/body`;
  const original = Buffer.from("synthetic upload body");
  const input = (objectKey, data, checksumSha256 = checksum(data)) => ({
    key: objectKey,
    body: Readable.from([data.subarray(0, 5), data.subarray(5)]),
    bytes: data.length,
    checksumSha256,
  });

  assert.equal(await store.put(input(key, original)), "stored");
  assert.equal(await store.put(input(key, Buffer.from("replacement"))), "exists");
  const downloaded = await store.get(key);
  assert.ok(downloaded);
  assert.equal(downloaded.bytes, original.length);
  assert.deepEqual(await buffer(downloaded.body), original);

  const unsigned = await globalThis.fetch(`${endpoint}/${bucket}/${key}`);
  assert.equal(unsigned.status, 403);
  await unsigned.body?.cancel();

  const bad = `quarantine/${randomUUID()}/body`;
  await assert.rejects(
    store.put(input(bad, original, checksum(Buffer.from("wrong")))),
    hasStatus(400),
  );
  assert.equal(await store.get(bad), undefined);

  const contested = `variants/${randomUUID()}/160.webp`;
  const candidates = Array.from({ length: 8 }, (_, i) => Buffer.from(`synthetic image ${i}`));
  const race = await Promise.allSettled(
    candidates.map((candidate) => store.put(input(contested, candidate))),
  );
  const winners = race.flatMap((outcome, i) =>
    outcome.status === "fulfilled" && outcome.value === "stored" ? [i] : [],
  );
  assert.equal(winners.length, 1);
  for (const outcome of race) {
    if (outcome.status === "rejected") assert.ok(hasStatus(409)(outcome.reason));
  }
  const winner = await store.get(contested);
  assert.ok(winner);
  assert.deepEqual(await buffer(winner.body), candidates[winners[0]]);

  await store.delete(key);
  await store.delete(key);
  assert.equal(await store.get(key), undefined);
});
