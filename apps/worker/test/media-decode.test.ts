import sharp from "sharp";
import { expect, test } from "vitest";
import { decodeUpload } from "../src/media-decode.ts";

const red = { r: 200, g: 40, b: 30 };

function canvas(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: red } });
}

async function jpegWithOrientation(orientation: number) {
  return canvas(96, 64)
    .jpeg()
    .withMetadata({ orientation, exif: { IFD0: { Copyright: "Synthetic fixture" } } })
    .toBuffer();
}

test("[MER-14:worker] decodes JPEG, PNG and WebP to raw RGBA at their real size", async () => {
  for (const [contentType, image] of [
    ["image/jpeg", canvas(96, 64).jpeg()],
    ["image/png", canvas(96, 64).png()],
    ["image/webp", canvas(96, 64).webp()],
  ] as const) {
    const result = await decodeUpload(await image.toBuffer(), { contentType, maxPixels: 10_000 });
    expect(result).toMatchObject({ kind: "decoded", width: 96, height: 64, channels: 4 });
    if (result.kind === "decoded") expect(result.pixels.length).toBe(96 * 64 * 4);
  }
});

test("[MER-14:worker] applies the EXIF orientation before cropping", async () => {
  const rotated = await decodeUpload(await jpegWithOrientation(6), {
    contentType: "image/jpeg",
    maxPixels: 10_000,
  });
  expect(rotated).toMatchObject({ kind: "decoded", width: 64, height: 96 });
});

test("[MER-14:worker] raw output carries no metadata", async () => {
  const result = await decodeUpload(await jpegWithOrientation(1), {
    contentType: "image/jpeg",
    maxPixels: 10_000,
  });
  if (result.kind !== "decoded") throw new Error("Expected a decoded image");
  const reencoded = await sharp(result.pixels, {
    raw: { width: result.width, height: result.height, channels: result.channels },
  })
    .png()
    .toBuffer();
  const metadata = await sharp(reencoded).metadata();
  expect(metadata.exif).toBeUndefined();
  expect(metadata.icc).toBeUndefined();
});

test("[MER-14:worker] rejects images above the decoded pixel bound", async () => {
  const large = await canvas(200, 100).png().toBuffer();
  await expect(
    decodeUpload(large, { contentType: "image/png", maxPixels: 19_999 }),
  ).resolves.toEqual({ kind: "rejected", reason: "too_many_pixels" });
});

test("[MER-14:worker] rejects a file whose bytes do not match the declared type", async () => {
  const png = await canvas(96, 64).png().toBuffer();
  await expect(
    decodeUpload(png, { contentType: "image/jpeg", maxPixels: 10_000 }),
  ).resolves.toEqual({ kind: "rejected", reason: "type_mismatch" });
});

test("[MER-14:worker] rejects corrupt and truncated files", async () => {
  const jpeg = await canvas(96, 64).jpeg().toBuffer();
  const options = { contentType: "image/jpeg", maxPixels: 10_000 } as const;
  await expect(decodeUpload(Buffer.from("not an image"), options)).resolves.toEqual({
    kind: "rejected",
    reason: "undecodable",
  });
  await expect(decodeUpload(jpeg.subarray(0, 200), options)).resolves.toEqual({
    kind: "rejected",
    reason: "undecodable",
  });
});
