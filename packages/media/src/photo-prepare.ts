import type { Sharp } from "sharp";

import { decodePhoto, rawImage } from "./photo-decode.js";
import type { PhotoInput, RejectedPhoto } from "./photo-decode.js";

type PreparedPhoto = {
  status: "prepared";
  preview: { bytes: Buffer; contentType: "image/webp"; width: number; height: number };
};

const maximumPreviewDimension = 1280;

function resizePreview(image: Sharp): Sharp {
  return image.resize(maximumPreviewDimension, maximumPreviewDimension, {
    fit: "inside",
    withoutEnlargement: true,
  });
}

export async function preparePhoto(input: PhotoInput): Promise<PreparedPhoto | RejectedPhoto> {
  const rgba = await decodePhoto(input, resizePreview);
  if ("status" in rgba) return rgba;

  const image = rawImage(rgba);
  if (Math.max(rgba.width, rgba.height) > maximumPreviewDimension) resizePreview(image);
  const { data, info } = await image.webp().toBuffer({ resolveWithObject: true });
  return {
    status: "prepared",
    preview: { bytes: data, contentType: "image/webp", width: info.width, height: info.height },
  };
}
