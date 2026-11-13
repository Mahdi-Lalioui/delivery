import sharp from "sharp";
import { expect, test } from "vitest";
import { renderCropPreview } from "../src/media-preview.ts";

async function rgba(width: number, height: number) {
  const { data } = await sharp({
    create: { width, height, channels: 4, background: { r: 90, g: 60, b: 20, alpha: 1 } },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, width, height, channels: 4 } as const;
}

test("[MER-14:worker] scales a large photo into a 1280-pixel private WebP preview", async () => {
  const preview = await renderCropPreview(await rgba(4032, 3024));

  expect(preview).toMatchObject({ width: 1280, height: 960 });
  const metadata = await sharp(preview.data).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 1280, height: 960 });
  expect(metadata.exif).toBeUndefined();
  expect(metadata.icc).toBeUndefined();
});

test("[MER-14:worker] bounds a tall photo by its height and never enlarges a small one", async () => {
  expect(await renderCropPreview(await rgba(900, 2000))).toMatchObject({
    width: 576,
    height: 1280,
  });
  expect(await renderCropPreview(await rgba(96, 64))).toMatchObject({ width: 96, height: 64 });
});
