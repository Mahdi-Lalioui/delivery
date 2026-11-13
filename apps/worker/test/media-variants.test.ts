import { mediaOutput, photoRatios, photoVariantWidths } from "@zaafran/contracts/media";
import sharp from "sharp";
import { thumbHashToApproximateAspectRatio } from "thumbhash";
import { expect, test } from "vitest";
import { renderVariants } from "../src/media-variants.ts";

async function rgba(width: number, height: number) {
  const { data } = await sharp({
    create: { width, height, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, width, height, channels: 4 } as const;
}

test("[MER-14:worker] publishes both formats at all five widths with the kind's ratio", async () => {
  const image = await rgba(400, 300);
  const area = { left: 0, top: 0, width: 400, height: 300 };
  const { variants, thumbhash } = await renderVariants(image, area, photoRatios.item);

  expect(variants.map(({ format, width, height }) => ({ format, width, height }))).toEqual([
    ...photoVariantWidths.map((width) => ({ format: "avif", width, height: (width * 3) / 4 })),
    ...photoVariantWidths.map((width) => ({ format: "webp", width, height: (width * 3) / 4 })),
  ]);
  for (const variant of variants) {
    const metadata = await sharp(variant.data).metadata();
    expect(metadata.format).toBe(variant.format === "avif" ? "heif" : "webp");
    expect([metadata.width, metadata.height]).toEqual([variant.width, variant.height]);
    expect(variant.bytes).toBe(variant.data.length);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  }

  const ready = mediaOutput.parse({
    status: "ready",
    mediaId: "01932f18-3150-7c33-8a7a-53acfd343201",
    sessionId: "01932f18-3150-7c33-8a7a-53acfd343202",
    kind: "item",
    variants: variants.map(({ format, width, height, bytes }) => ({
      format,
      width,
      height,
      bytes,
    })),
    thumbhash,
  });
  expect(ready.status).toBe("ready");
});

test("[MER-14:worker] cuts the crop area and encodes a Base64 ThumbHash at its ratio", async () => {
  const image = await rgba(1600, 900);
  const area = { left: 350, top: 0, width: 900, height: 900 };
  const { variants, thumbhash } = await renderVariants(image, area, photoRatios.logo);

  expect(variants.every(({ width, height }) => width === height)).toBe(true);
  const ratio = thumbHashToApproximateAspectRatio(Buffer.from(thumbhash, "base64"));
  expect(ratio).toBeCloseTo(1, 1);
});
