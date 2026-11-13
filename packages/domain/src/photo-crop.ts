interface Size {
  readonly width: number;
  readonly height: number;
}

interface Crop {
  /** Focal point in basis points of the image width and height (0–10 000). */
  readonly focalX: number;
  readonly focalY: number;
  readonly zoomPercent: number;
}

export interface CropArea extends Size {
  readonly left: number;
  readonly top: number;
}

function largestAreaAtRatio(image: Size, ratio: Size): Size {
  if (image.width * ratio.height >= image.height * ratio.width) {
    return { width: Math.floor((image.height * ratio.width) / ratio.height), height: image.height };
  }
  return { width: image.width, height: Math.floor((image.width * ratio.height) / ratio.width) };
}

function clamp(value: number, maximum: number): number {
  return Math.min(Math.max(value, 0), maximum);
}

function centreOn(focalBasisPoints: number, imageLength: number, areaLength: number): number {
  const focal = (imageLength * focalBasisPoints) / 10_000;
  return clamp(Math.round(focal - areaLength / 2), imageLength - areaLength);
}

/** The pixel area to cut: the largest area at the ratio, zoomed and centred on the focal point. */
export function cropRectangle(image: Size, ratio: Size, crop: Crop): CropArea {
  const base = largestAreaAtRatio(image, ratio);
  const width = clamp(Math.max(1, Math.round((base.width * 100) / crop.zoomPercent)), image.width);
  const height = clamp(Math.max(1, Math.round((width * ratio.height) / ratio.width)), image.height);
  return {
    left: centreOn(crop.focalX, image.width, width),
    top: centreOn(crop.focalY, image.height, height),
    width,
    height,
  };
}
