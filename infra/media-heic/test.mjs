import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { after, test } from "node:test";

const [helperPath, fixturePath] = process.argv.slice(2).map((path) => resolve(path));
const fixture = readFileSync(fixturePath);
const workspace = mkdtempSync(join(tmpdir(), "zaafran-heic-"));
after(() => rmSync(workspace, { recursive: true, force: true }));

function run(args, stdout = "pipe") {
  const result = spawnSync(helperPath, args, {
    stdio: ["ignore", stdout, "pipe"],
    maxBuffer: 128 * 1024,
    timeout: 10_000,
    killSignal: "SIGKILL",
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

function input(name, contents) {
  const path = join(workspace, name);
  writeFileSync(path, contents, { mode: 0o600 });
  return path;
}

test("[MER-14:codec] the primary HEVC image decodes to packed RGBA", () => {
  const result = run([fixturePath]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, 8 + 96 * 64 * 4);
  assert.equal(result.stdout.readUInt32LE(0), 96);
  assert.equal(result.stdout.readUInt32LE(4), 64);
  assert.equal(result.stdout[11], 255);
  assert.notDeepEqual(result.stdout.subarray(8, 12), result.stdout.subarray(-4));
});

test("[MER-14:codec] HEIF rotation is applied to the decoded primary image", () => {
  const rotated = Buffer.from(fixture);
  rotated[rotated.indexOf("irot") + 4] = 1;
  const result = run([input("rotated.heic", rotated)]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, 8 + 64 * 96 * 4);
  assert.equal(result.stdout.readUInt32LE(0), 64);
  assert.equal(result.stdout.readUInt32LE(4), 96);
});

test("[MER-14:codec] malformed input returns the deterministic rejection exit", () => {
  const path = input("truncated.heic", fixture.subarray(0, 300));
  const result = run([path]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.length, 0);
});

test("[MER-14:codec] a malformed HEVC slice is rejected without partial output", () => {
  const corrupt = Buffer.from(fixture);
  // Skip the extended mdat header, NAL length and two-byte NAL header.
  // Change the slice's picture parameter set reference from 0 to the absent ID 1.
  corrupt[corrupt.indexOf("mdat") + 18] = 0x97;
  const result = run([input("missing-pps.heic", corrupt)]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.length, 0);
});

test("[MER-14:codec] oversized image dimensions return the deterministic rejection exit", () => {
  const oversized = Buffer.from(fixture);
  const dimensions = oversized.indexOf("ispe") + 8;
  oversized.writeUInt32BE(8192, dimensions);
  oversized.writeUInt32BE(4096, dimensions + 4);
  const result = run([input("oversized.heic", oversized)]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.length, 0);
});

test("[MER-14:codec] a file beyond the upload byte limit is rejected before decoding", () => {
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
  fixture.copy(oversized);
  const result = run([input("too-large.heic", oversized)]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.length, 0);
});

test("relative paths and unreadable inputs return the infrastructure exit", () => {
  for (const args of [[], ["relative.heic"], [join(workspace, "missing.heic")], [workspace]]) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout.length, 0);
  }
});

test(
  "failed stdout writes return the infrastructure exit",
  { skip: process.platform !== "linux" },
  () => {
    const full = openSync("/dev/full", "w");
    try {
      assert.equal(run([fixturePath], full).status, 2);
    } finally {
      closeSync(full);
    }
  },
);
