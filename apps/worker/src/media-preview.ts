import sharp from "sharp";
import type { RawImage } from "./media-decode.js";

const previewMaximumSide = 1280;

/**
 * The private, metadata-free preview the browser crops against, even for HEIC it cannot decode.
 * It keeps the original's aspect ratio so crop coordinates map back exactly (D-007).
 */
export async function renderCropPreview(image: RawImage) {
  const { width, height, channels } = image;
  const { data, info } = await sharp(image.pixels, { raw: { width, height, channels } })
    .resize(previewMaximumSide, previewMaximumSide, { fit: "inside", withoutEnlargement: true })
    .webp()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
