import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import sharp from "sharp";
import { thumbHashToRGBA } from "thumbhash";
import { cropPhoto, preparePhoto } from "../dist/index.js";

const heicDecoderPath = process.env.HEIC_DECODER_PATH;
assert(heicDecoderPath && isAbsolute(heicDecoderPath), "Set HEIC_DECODER_PATH to the decoder.");
const bytes = await readFile(new URL("./fixtures/synthetic.heic", import.meta.url));
const input = { bytes, contentType: "image/heic", heicDecoderPath };
const result = await preparePhoto(input);
assert.equal(result.status, "prepared");
const { preview } = result;
assert.equal(preview.contentType, "image/webp");
assert.deepEqual([preview.width, preview.height], [96, 64]);
const metadata = await sharp(preview.bytes).metadata();
assert.equal(metadata.format, "webp");
assert.deepEqual([metadata.width, metadata.height], [96, 64]);
assert(!metadata.exif && !metadata.iptc && !metadata.xmp && !metadata.icc);
process.stdout.write("Real HEVC photo prepared as a 96×64 metadata-free WebP preview.\n");

const cropped = await cropPhoto({
  ...input,
  kind: "item",
  crop: { focalX: 10_000, focalY: 0, zoomPercent: 200 },
});
assert.equal(cropped.status, "cropped");
for (const format of ["webp", "avif"]) {
  const variants = cropped.variants.filter((variant) => variant.format === format);
  assert.deepEqual(
    variants.map(({ width }) => width),
    [160, 320, 640, 960, 1280],
  );
  for (const variant of variants) {
    const encoded = await sharp(variant.bytes).metadata();
    assert.equal(encoded.mediaType, `image/${format}`);
    assert.equal(encoded.width, variant.width);
    assert.equal(encoded.height, (variant.width * 3) / 4);
    assert(!encoded.exif && !encoded.iptc && !encoded.xmp && !encoded.icc);
  }
}
const placeholder = thumbHashToRGBA(Buffer.from(cropped.thumbhash, "base64"));
assert(placeholder.w > placeholder.h && placeholder.rgba.length > 0);
process.stdout.write("Real HEVC photo cropped into ten metadata-free variants and a ThumbHash.\n");
