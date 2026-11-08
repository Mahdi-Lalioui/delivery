import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { preparePhoto } from "../src/index.ts";

vi.mock("sharp", { spy: true });

function solidPhoto(width = 24, height = 16) {
  return sharp({ create: { width, height, channels: 3, background: "blue" } });
}

describe("private photo preparation", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)(
    "[MER-14:codec] decodes %s into a browser-ready WebP preview",
    async (format, contentType) => {
      const bytes = await solidPhoto().toFormat(format).toBuffer();
      const result = await preparePhoto({ bytes, contentType });
      expect(result.status).toBe("prepared");
      if (result.status !== "prepared") throw new Error("Missing preview");
      expect(result.preview).toMatchObject({ contentType: "image/webp", width: 24, height: 16 });
      await expect(sharp(result.preview.bytes).metadata()).resolves.toMatchObject({
        format: "webp",
        width: 24,
        height: 16,
      });
    },
  );

  it("[MER-14:codec] converts grayscale pixels to an opaque WebP preview", async () => {
    const bytes = await sharp({
      create: { width: 24, height: 16, channels: 3, background: "#818181" },
    })
      .toColourspace("b-w")
      .png()
      .toBuffer();
    const inputMetadata = await sharp(bytes).metadata();
    expect(inputMetadata.channels).toBe(1);

    const result = await preparePhoto({ bytes, contentType: "image/png" });
    if (result.status !== "prepared") throw new Error("Missing preview");
    const rgba = await sharp(result.preview.bytes).ensureAlpha().raw().toBuffer();
    for (const channel of rgba.subarray(0, 3)) {
      expect(Math.abs(channel - 129)).toBeLessThan(5);
    }
    expect(rgba.at(3)).toBe(255);
  });

  it("[MER-14:codec] converts CMYK pixels to an opaque WebP preview", async () => {
    const bytes = await solidPhoto().toColourspace("cmyk").jpeg().toBuffer();
    const inputMetadata = await sharp(bytes).metadata();
    expect(inputMetadata.space).toBe("cmyk");

    const result = await preparePhoto({ bytes, contentType: "image/jpeg" });
    if (result.status !== "prepared") throw new Error("Missing preview");
    const rgba = await sharp(result.preview.bytes).ensureAlpha().raw().toBuffer();
    expect(rgba.at(2)).toBeGreaterThan(100);
    expect(rgba.at(0)).toBeLessThan(60);
    expect(rgba.at(3)).toBe(255);
  });

  it("[MER-14:codec] rotates the pixels before resizing and discards metadata", async () => {
    const bytes = await solidPhoto(1500, 750)
      .composite([{ input: await solidPhoto(750, 750).negate().png().toBuffer(), top: 0, left: 0 }])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Artist: "synthetic camera owner" } })
      .withXmp("<synthetic>private camera metadata</synthetic>")
      .toBuffer();
    const inputMetadata = await sharp(bytes).metadata();
    expect(inputMetadata).toMatchObject({ orientation: 6, hasProfile: true });
    expect(inputMetadata.exif).toBeDefined();
    expect(inputMetadata.xmp).toBeDefined();
    const result = await preparePhoto({ bytes, contentType: "image/jpeg" });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") throw new Error("Missing preview");
    const { preview } = result;
    expect(preview).toMatchObject({ width: 640, height: 1280 });
    const metadata = await sharp(preview.bytes).metadata();
    expect(metadata).toMatchObject({ width: 640, height: 1280, hasProfile: false });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    const pixels = await sharp(preview.bytes).raw().toBuffer();
    expect(pixels.at(0)).toBeGreaterThan(220); // Left (yellow) rotated to the top.
    expect(pixels.at(-1)).toBeGreaterThan(220); // Right (blue) rotated to the bottom.
  });

  it("[MER-14:codec] rejects an upload whose actual format differs from the declaration", async () => {
    const bytes = await solidPhoto().png().toBuffer();
    await expect(preparePhoto({ bytes, contentType: "image/jpeg" })).resolves.toEqual({
      status: "rejected",
      reason: "content_type_mismatch",
    });
  });

  it("[MER-14:codec] rejects AVIF declared as HEIC before starting the native decoder", async () => {
    const bytes = await solidPhoto().avif().toBuffer();
    await expect(preparePhoto({ bytes, contentType: "image/heic" })).resolves.toEqual({
      status: "rejected",
      reason: "content_type_mismatch",
    });
  });

  it("[MER-14:codec] rejects SVG declared as a photo", async () => {
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    await expect(preparePhoto({ bytes, contentType: "image/png" })).resolves.toEqual({
      status: "rejected",
      reason: "content_type_mismatch",
    });
  });

  it("[MER-14:codec] rejects an empty or incomplete image", async () => {
    const jpeg = await solidPhoto(120, 80).jpeg().toBuffer();
    for (const bytes of [Buffer.alloc(0), jpeg.subarray(0, jpeg.length - 20)]) {
      await expect(preparePhoto({ bytes, contentType: "image/jpeg" })).resolves.toEqual({
        status: "rejected",
        reason: "invalid_image",
      });
    }
  });

  it.each([
    "failed to allocate 4096 bytes",
    "vips_tracked: out of memory -- size == 4MB",
    "Could not allocate enough memory for raw output",
    "Could not allocate memory",
    "Insufficient memory to process iCCP chunk",
    "unable to create thread",
  ])("[MER-14:codec] retries when raster decoding reports %s", async (message) => {
    const bytes = await solidPhoto().png().toBuffer();
    const image = sharp(bytes);
    const allocationError = new Error(message);
    vi.spyOn(image, "toBuffer").mockRejectedValueOnce(allocationError);
    const createImage = vi.mocked(sharp).mockReturnValueOnce(image);

    try {
      await expect(preparePhoto({ bytes, contentType: "image/png" })).rejects.toBe(allocationError);
    } finally {
      createImage.mockReset();
    }
  });

  it("[MER-14:codec] enforces the inclusive 8 MiB input limit", async () => {
    const jpeg = await solidPhoto().jpeg().toBuffer();
    const bytes = Buffer.alloc(8 * 1024 * 1024 + 1);
    jpeg.copy(bytes);
    await expect(
      preparePhoto({ bytes: bytes.subarray(0, bytes.length - 1), contentType: "image/jpeg" }),
    ).resolves.toMatchObject({ status: "prepared" });
    await expect(preparePhoto({ bytes, contentType: "image/jpeg" })).resolves.toEqual({
      status: "rejected",
      reason: "image_too_large",
    });
  });

  it("[MER-14:codec] rejects compressed images exceeding 24 Mi decoded pixels", async () => {
    const bytes = await solidPhoto(8192, 3073).png().toBuffer();
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
    await expect(preparePhoto({ bytes, contentType: "image/png" })).resolves.toEqual({
      status: "rejected",
      reason: "image_too_large",
    });
  });
});

describe("HEIC decoder process boundary", () => {
  // A file-type box only. These tests exercise the process protocol independently of libheif.
  const bytes = Buffer.from("000000186674797068656963000000006d69663168656963", "hex");
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "zaafran-heic-process-test-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function decoder(script: string): Promise<string> {
    const path = join(directory, "decoder helper.cjs");
    await writeFile(path, `#!${process.execPath}\n${script}\n`, { mode: 0o700 });
    return path;
  }

  it("[MER-14:codec] passes an absolute private file and re-encodes the helper's packed RGBA", async () => {
    const marker = join(directory, "path");
    const heicDecoderPath = await decoder(`
      const { readFileSync, statSync, writeFileSync } = require('node:fs');
      const { dirname, isAbsolute } = require('node:path');
      const path = process.argv[2];
      writeFileSync(${JSON.stringify(marker)}, path);
      if (process.argv.length !== 3 || !isAbsolute(path) ||
          (statSync(dirname(path)).mode & 0o777) !== 0o700 ||
          (statSync(path).mode & 0o777) !== 0o600 ||
          readFileSync(path).toString('hex') !== ${JSON.stringify(bytes.toString("hex"))}) {
        process.exit(2);
      }
      process.stdout.write(Buffer.from('0200000001000000ff0000ff0000ff80', 'hex'));
    `);
    const result = await preparePhoto({ bytes, contentType: "image/heic", heicDecoderPath });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") throw new Error("Missing preview");
    expect(result.preview).toMatchObject({ contentType: "image/webp", width: 2, height: 1 });
    const rgba = await sharp(result.preview.bytes).ensureAlpha().raw().toBuffer();
    expect(rgba.at(3)).toBe(255);
    expect(rgba.at(7)).toBe(128);
    await expect(stat(dirname(await readFile(marker, "utf8")))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("[MER-14:codec] maps decoder rejection to invalid image and cleans its input", async () => {
    const marker = join(directory, "path");
    const heicDecoderPath = await decoder(`
      require('node:fs').writeFileSync(${JSON.stringify(marker)}, process.argv[2]);
      process.exit(1);
    `);
    await expect(
      preparePhoto({ bytes, contentType: "image/heic", heicDecoderPath }),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_image" });
    await expect(stat(dirname(await readFile(marker, "utf8")))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    ["infrastructure exit", "process.exit(2);"],
    ["signal", "process.kill(process.pid, 'SIGKILL');"],
    ["zero dimensions", "process.stdout.write(Buffer.alloc(8));"],
    ["oversized dimensions", "process.stdout.write(Buffer.from('ffffffffffffffff','hex'));"],
    ["short pixel payload", "process.stdout.write(Buffer.from('0100000001000000','hex'));"],
    [
      "long pixel payload",
      "process.stdout.write(Buffer.from('01000000010000000102030405','hex'));",
    ],
  ])("[MER-14:codec] throws for %s so the job can retry", async (_description, script) => {
    const heicDecoderPath = await decoder(script);
    await expect(
      preparePhoto({ bytes, contentType: "image/heic", heicDecoderPath }),
    ).rejects.toThrow();
  });

  it("[MER-14:codec] throws if the configured decoder executable is missing", async () => {
    const heicDecoderPath = join(directory, "missing");
    await expect(
      preparePhoto({ bytes, contentType: "image/heic", heicDecoderPath }),
    ).rejects.toThrow();
  });
});
