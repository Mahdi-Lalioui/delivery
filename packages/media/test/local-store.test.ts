import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalMediaStore } from "../src/index.ts";

const key = "quarantine/local-store-fixture/body";
const data = Buffer.from("synthetic photo bytes");
const checksum = (bytes: Buffer) => createHash("sha256").update(bytes).digest("base64");

function upload(body = data) {
  return {
    key,
    bytes: body.length,
    checksumSha256: checksum(body),
    body: Readable.from([body.subarray(0, 7), body.subarray(7)]),
  };
}

function* interruptedBody() {
  yield Buffer.from("start");
  throw new Error("upload interrupted");
}

describe("local private media store", () => {
  let directory: string;
  let root: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "zaafran-media-test-"));
    root = join(directory, "private");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("stores exact bytes privately and preserves the first successful write", async () => {
    const store = createLocalMediaStore({ root });
    await expect(store.put(upload())).resolves.toBe("stored");
    await expect(store.put(upload(Buffer.from("replacement")))).resolves.toBe("exists");

    const stored = await store.get(key);
    expect(stored?.bytes).toBe(data.length);
    expect(stored && (await buffer(stored.body))).toEqual(data);
    const files = await readdir(root);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect((await stat(join(root, files[0] ?? ""))).mode & 0o777).toBe(0o600);
    expect((await stat(root)).mode & 0o777).toBe(0o700);

    await store.delete(key);
    await store.delete(key);
    await expect(store.get(key)).resolves.toBeUndefined();
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("publishes exactly one complete object under concurrent writes", async () => {
    const store = createLocalMediaStore({ root });
    const candidates = Array.from({ length: 8 }, (_, i) => Buffer.from(String(i)));
    const results = await Promise.all(candidates.map((candidate) => store.put(upload(candidate))));
    expect(results.filter((result) => result === "stored")).toHaveLength(1);
    expect(results.filter((result) => result === "exists")).toHaveLength(7);
    const stored = await store.get(key);
    expect(stored && (await buffer(stored.body))).toEqual(candidates[results.indexOf("stored")]);
    await expect(readdir(root)).resolves.toHaveLength(1);
  });

  it("cleans up invalid checksums, truncated or overlong data, and interrupted streams", async () => {
    const store = createLocalMediaStore({ root });
    await expect(
      store.put({ ...upload(), checksumSha256: checksum(Buffer.from("wrong")) }),
    ).rejects.toThrow(/checksum/i);
    await expect(store.put({ ...upload(), bytes: data.length + 1 })).rejects.toThrow(/length/i);
    await expect(store.put({ ...upload(), bytes: data.length - 1 })).rejects.toThrow(/length/i);
    await expect(
      store.put({ ...upload(), body: Readable.from(interruptedBody()) }),
    ).rejects.toThrow("upload interrupted");
    await expect(store.get(key)).resolves.toBeUndefined();
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("rejects malformed declarations and unsafe key paths before writing", async () => {
    const store = createLocalMediaStore({ root });
    for (const invalid of [
      "../outside",
      "/absolute",
      "a//b",
      "a/./b",
      "a/../b",
      "a/%2e%2e/b",
      "a\\b",
    ]) {
      await expect(store.put({ ...upload(), key: invalid })).rejects.toThrow(/key/i);
      await expect(store.get(invalid)).rejects.toThrow(/key/i);
      await expect(store.delete(invalid)).rejects.toThrow(/key/i);
    }
    await expect(store.put({ ...upload(), bytes: 0 })).rejects.toThrow(/length/i);
    await expect(
      store.put({ ...upload(), checksumSha256: checksum(data).slice(0, -1) }),
    ).rejects.toThrow(/checksum/i);
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it("refuses public or symlink roots and cannot open a symlink object", async () => {
    await mkdir(root, { mode: 0o755 });
    const store = createLocalMediaStore({ root });
    await expect(store.put(upload())).rejects.toThrow(/private/i);
    const link = join(directory, "alias");
    await symlink(root, link);
    await expect(createLocalMediaStore({ root: link }).get(key)).rejects.toThrow(/private/i);

    const validRoot = join(directory, "valid");
    await mkdir(validRoot, { mode: 0o700 });
    const hash = createHash("sha256").update(key).digest("hex");
    await symlink(root, join(validRoot, hash));
    await expect(createLocalMediaStore({ root: validRoot }).get(key)).rejects.toThrow();
  });
});
