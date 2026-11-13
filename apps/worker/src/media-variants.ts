import { photoVariantWidths } from "@zaafran/contracts/media";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import type { CropArea } from "./media-crop.js";
import type { RawImage } from "./media-decode.js";

interface Size {
  readonly width: number;
  readonly height: number;
}

type VariantFormat = "avif" | "webp";

export interface EncodedVariant {
  readonly format: VariantFormat;
  readonly width: (typeof photoVariantWidths)[number];
  readonly height: number;
  readonly bytes: number;
  readonly data: Buffer;
}

const formats = ["avif", "webp"] as const satisfies readonly VariantFormat[];
const thumbHashMaximumSide = 100;

function cut(image: RawImage, area: CropArea) {
  const { width, height, channels } = image;
  return sharp(image.pixels, { raw: { width, height, channels } }).extract(area);
}

async function encode(
  image: RawImage,
  area: CropArea,
  target: { format: VariantFormat; width: EncodedVariant["width"]; height: number },
): Promise<EncodedVariant> {
  const resized = cut(image, area).resize(target.width, target.height, { fit: "fill" });
  const data = await (target.format === "avif" ? resized.avif() : resized.webp()).toBuffer();
  return { ...target, bytes: data.length, data };
}

async function encodeThumbHash(image: RawImage, area: CropArea): Promise<string> {
  const { data, info } = await cut(image, area)
    .resize(thumbHashMaximumSide, thumbHashMaximumSide, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}

/** Encodes every published variant and the ThumbHash; the caller publishes only after all exist. */
export async function renderVariants(
  image: RawImage,
  area: CropArea,
  ratio: Size,
): Promise<{ variants: EncodedVariant[]; thumbhash: string }> {
  const targets = formats.flatMap((format) =>
    photoVariantWidths.map((width) => ({
      format,
      width,
      height: Math.round((width * ratio.height) / ratio.width),
    })),
  );
  const variants: EncodedVariant[] = [];
  for (const target of targets) variants.push(await encode(image, area, target));
  return { variants, thumbhash: await encodeThumbHash(image, area) };
}
