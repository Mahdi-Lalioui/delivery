import { photoRatios, photoVariantWidths } from "@zaafran/contracts/media";
import type { mediaCropInput } from "@zaafran/contracts/media";
import { rgbaToThumbHash } from "thumbhash";

import type { DecodedRgba } from "./heic-decoder.js";
import { decodePhoto, rawImage } from "./photo-decode.js";
import type { PhotoInput, RejectedPhoto } from "./photo-decode.js";
import { gradeFoodPhoto } from "./photo-style.js";

type PhotoCrop = ReturnType<typeof mediaCropInput.parse>;
type PhotoKind = keyof typeof photoRatios;
type Dimensions = { width: number; height: number };
type CropPhotoInput = PhotoInput & { kind: PhotoKind; crop: PhotoCrop };

const variantFormats = ["webp", "avif"] as const;
const maximumVariantWidth = Math.max(...photoVariantWidths);
const maximumThumbHashDimension = 100;

type EncodedVariant = {
  format: (typeof variantFormats)[number];
  width: (typeof photoVariantWidths)[number];
  height: number;
  bytes: Buffer;
};

type CroppedPhoto = { status: "cropped"; variants: EncodedVariant[]; thumbhash: string };

function focalOffset(focal: number, cropSize: number, imageSize: number): number {
  const start = Math.round((focal / 10_000) * imageSize - cropSize / 2);
  return Math.min(Math.max(0, start), imageSize - cropSize);
}

function cropRegion(image: Dimensions, ratio: Dimensions, crop: PhotoCrop) {
  const fit = Math.min(image.width / ratio.width, image.height / ratio.height);
  const scale = fit / (crop.zoomPercent / 100);
  // Sharp extracts whole pixels, including when the desired crop is smaller than one pixel.
  const width = Math.max(1, Math.round(scale * ratio.width));
  const height = Math.max(1, Math.round(scale * ratio.height));
  return {
    width,
    height,
    left: focalOffset(crop.focalX, width, image.width),
    top: focalOffset(crop.focalY, height, image.height),
  };
}

async function decodeCrop(input: CropPhotoInput, ratio: Dimensions) {
  const rgba = await decodePhoto(input);
  if ("status" in rgba) return rgba;

  const height = (maximumVariantWidth * ratio.height) / ratio.width;
  const crop = rawImage(rgba)
    .extract(cropRegion(rgba, ratio, input.crop))
    .resize(maximumVariantWidth, height, { fit: "fill" });
  const photo = input.kind === "item" || input.kind === "cover" ? gradeFoodPhoto(crop) : crop;
  const bytes = await photo.raw().toBuffer();
  return { bytes, width: maximumVariantWidth, height };
}

async function encodeThumbHash(photo: DecodedRgba): Promise<string> {
  const { data, info } = await rawImage(photo)
    .resize(maximumThumbHashDimension, maximumThumbHashDimension, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}

export async function cropPhoto(input: CropPhotoInput): Promise<CroppedPhoto | RejectedPhoto> {
  const ratio = photoRatios[input.kind];
  const photo = await decodeCrop(input, ratio);
  if ("status" in photo) return photo;

  const thumbhash = await encodeThumbHash(photo);
  const variants: EncodedVariant[] = [];
  for (const width of photoVariantWidths) {
    const height = (width * ratio.height) / ratio.width;
    for (const format of variantFormats) {
      const bytes = await rawImage(photo).resize(width, height).toFormat(format).toBuffer();
      variants.push({ format, width, height, bytes });
    }
  }
  return { status: "cropped", variants, thumbhash };
}
