import { photoRatios } from "@zaafran/contracts/media";
import type { Crop, PhotoKind } from "./media-photo-http";

type Dimensions = { width: number; height: number };

function offset(focal: number, size: number, imageSize: number) {
  const start = Math.round((focal / 10_000) * imageSize - size / 2);
  return Math.min(Math.max(0, start), imageSize - size);
}

export function cropRegion(image: Dimensions, kind: PhotoKind, crop: Crop) {
  const ratio = photoRatios[kind];
  const fit = Math.min(image.width / ratio.width, image.height / ratio.height);
  const scale = fit / (crop.zoomPercent / 100);
  const width = Math.max(1, Math.round(scale * ratio.width));
  const height = Math.max(1, Math.round(scale * ratio.height));
  return {
    width,
    height,
    left: offset(crop.focalX, width, image.width),
    top: offset(crop.focalY, height, image.height),
  };
}
