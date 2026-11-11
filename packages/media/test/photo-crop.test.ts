import sharp from "sharp";
import { thumbHashToRGBA } from "thumbhash";
import { describe, expect, it } from "vitest";

import { cropPhoto } from "../src/index.ts";

const center = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };
const widths = [160, 320, 640, 960, 1280];

describe("photo crop encoding", () => {
  it.each([
    ["application", [90, 180, 360, 540, 720]],
    ["cover", [90, 180, 360, 540, 720]],
    ["item", [120, 240, 480, 720, 960]],
    ["logo", [160, 320, 640, 960, 1280]],
  ] as const)(
    "[MER-14:codec] produces both formats at all five %s sizes",
    async (kind, heights) => {
      const bytes = await sharp({ create: { width: 3, height: 1, channels: 3, background: "red" } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .withExifMerge({ IFD0: { Artist: "synthetic camera owner" } })
        .withXmp("<synthetic>private camera metadata</synthetic>")
        .toBuffer();

      const result = await cropPhoto({ bytes, contentType: "image/jpeg", kind, crop: center });
      if (result.status !== "cropped") throw new Error("Missing crop variants");
      expect(result.variants).toHaveLength(10);

      for (const format of ["webp", "avif"] as const) {
        const variants = result.variants.filter((variant) => variant.format === format);
        expect(variants.map(({ width }) => width)).toEqual(widths);
        expect(variants.map(({ height }) => height)).toEqual(heights);

        for (const variant of variants) {
          const metadata = await sharp(variant.bytes).metadata();
          expect(metadata).toMatchObject({
            mediaType: `image/${format}`,
            width: variant.width,
            height: variant.height,
            hasProfile: false,
          });
          expect(metadata.exif).toBeUndefined();
          expect(metadata.xmp).toBeUndefined();
          expect(metadata.iptc).toBeUndefined();
          expect(metadata.orientation).toBeUndefined();
        }
      }
    },
  );

  it.each([
    [100, 2],
    [400, 0],
  ] as const)(
    "[MER-14:codec] applies a right-edge focal point at %i%% zoom to the crop and ThumbHash",
    async (zoomPercent, channel) => {
      const red = await sharp({
        create: { width: 56, height: 120, channels: 3, background: "red" },
      })
        .png()
        .toBuffer();
      const bytes = await sharp({
        create: { width: 320, height: 120, channels: 3, background: "blue" },
      })
        .composite([{ input: red, top: 0, left: 264 }])
        .png()
        .toBuffer();
      const result = await cropPhoto({
        bytes,
        contentType: "image/png",
        kind: "logo",
        crop: { focalX: 10_000, focalY: 5_000, zoomPercent },
      });
      if (result.status !== "cropped") throw new Error("Missing crop variants");
      const variant = result.variants.find(
        ({ format, width }) => format === "webp" && width === 160,
      );
      if (!variant) throw new Error("Missing 160-pixel WebP");
      const pixel = await sharp(variant.bytes)
        .extract({ left: 80, top: 80, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(pixel.at(channel)).toBeGreaterThan(175);

      const hash = Buffer.from(result.thumbhash, "base64");
      expect(hash.toString("base64")).toBe(result.thumbhash);
      const placeholder = thumbHashToRGBA(hash);
      expect(placeholder.w).toBe(placeholder.h);
      if (zoomPercent === 400) expect(placeholder.rgba.at(channel)).toBeGreaterThan(200);
    },
  );

  it("[MER-14:codec] interprets the focal point in EXIF-oriented coordinates", async () => {
    const red = await sharp({ create: { width: 96, height: 96, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const bytes = await sharp({
      create: { width: 192, height: 96, channels: 3, background: "blue" },
    })
      .composite([{ input: red, top: 0, left: 0 }])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await cropPhoto({
      bytes,
      contentType: "image/jpeg",
      kind: "item",
      crop: { focalX: 5_000, focalY: 0, zoomPercent: 100 },
    });
    if (result.status !== "cropped") throw new Error("Missing crop variants");
    const variant = result.variants.find(({ format, width }) => format === "webp" && width === 160);
    if (!variant) throw new Error("Missing 160-pixel WebP");
    const { channels } = await sharp(variant.bytes).stats();
    expect(channels.at(0)?.mean).toBeGreaterThan(230);
    expect(channels.at(2)?.mean).toBeLessThan(20);
  });

  it("[MER-14:codec] rejects mismatched quarantined originals before encoding", async () => {
    const bytes = await sharp({ create: { width: 24, height: 16, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    await expect(
      cropPhoto({ bytes, contentType: "image/jpeg", kind: "cover", crop: center }),
    ).resolves.toEqual({ status: "rejected", reason: "content_type_mismatch" });
  });
});
