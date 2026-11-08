import sharp from "sharp";
import type { Sharp } from "sharp";
import { photoUploadMaximumBytes } from "@zaafran/contracts/media";

import { decodeHeic, photoMaximumPixels } from "./heic-decoder.js";
import type { DecodedRgba } from "./heic-decoder.js";

export interface PhotoInput {
  bytes: Buffer;
  contentType: string;
  heicDecoderPath?: string;
}

export type RejectedPhoto = {
  status: "rejected";
  reason: "content_type_mismatch" | "invalid_image" | "image_too_large";
};

// Sharp 0.35.5 forwards native decoder failures as untyped error messages.
const allocationFailure =
  /\b(?:(?:failed to|could not) allocate (?:\d+ bytes?|(?:enough )?memory)|out of memory|not enough memory|insufficient memory|memory allocation failed|unable to create thread)\b/iu;

const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const heifBrands = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);
const avifBrands = new Set(["avif", "avis"]);

function hasHeifFileType(bytes: Buffer): boolean {
  if (bytes.length < 16 || bytes.toString("latin1", 4, 8) !== "ftyp") return false;
  const size = bytes.readUInt32BE(0);
  if (size < 16 || size > bytes.length || size % 4 !== 0) return false;

  const majorBrand = bytes.toString("latin1", 8, 12);
  if (avifBrands.has(majorBrand)) return false;
  let isHeif = heifBrands.has(majorBrand);
  // The minor version is at offset 12. The remaining entries are compatible brands.
  for (let offset = 16; offset < size; offset += 4) {
    const brand = bytes.toString("latin1", offset, offset + 4);
    if (avifBrands.has(brand)) return false;
    if (heifBrands.has(brand)) isHeif = true;
  }
  // The native decoder verifies the primary image codec. A brand alone is only a container hint.
  return isHeif;
}

function matchesRasterSignature(bytes: Buffer, contentType: string): boolean {
  switch (contentType) {
    case "image/jpeg":
      return bytes.subarray(0, jpegSignature.length).equals(jpegSignature);
    case "image/png":
      return bytes.subarray(0, pngSignature.length).equals(pngSignature);
    case "image/webp":
      return (
        bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP"
      );
    default:
      return false;
  }
}

function rejected(reason: RejectedPhoto["reason"]): RejectedPhoto {
  return { status: "rejected", reason };
}

async function decodeRaster(
  bytes: Buffer,
  contentType: string,
  transform?: (image: Sharp) => Sharp,
): Promise<DecodedRgba | RejectedPhoto> {
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: photoMaximumPixels });
    const metadata = await image.metadata();
    if (metadata.mediaType !== contentType) return rejected("content_type_mismatch");

    const oriented = image.autoOrient();
    const { data, info } = await (transform?.(oriented) ?? oriented)
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  } catch (error) {
    if (!(error instanceof Error) || allocationFailure.test(error.message)) throw error;
    // Sharp 0.35.5 reports its decoded-pixel guard with this error and no code.
    if (error.message === "Input image exceeds pixel limit") {
      return rejected("image_too_large");
    }
    return rejected("invalid_image");
  }
}

export function rawImage({ bytes, width, height }: DecodedRgba): Sharp {
  return sharp(bytes, {
    raw: { width, height, channels: 4 },
    limitInputPixels: photoMaximumPixels,
  });
}

export async function decodePhoto(
  { bytes, contentType, heicDecoderPath }: PhotoInput,
  transformRaster?: (image: Sharp) => Sharp,
): Promise<DecodedRgba | RejectedPhoto> {
  if (bytes.length > photoUploadMaximumBytes) return rejected("image_too_large");
  if (bytes.length === 0) return rejected("invalid_image");

  if (contentType === "image/heic") {
    if (!hasHeifFileType(bytes)) return rejected("content_type_mismatch");
    const rgba = await decodeHeic(bytes, heicDecoderPath);
    return rgba ?? rejected("invalid_image");
  }

  if (!matchesRasterSignature(bytes, contentType)) return rejected("content_type_mismatch");
  return decodeRaster(bytes, contentType, transformRaster);
}
