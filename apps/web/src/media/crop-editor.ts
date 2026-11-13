import { photoRatios } from "@zaafran/contracts/media";
import { cropRectangle } from "@zaafran/domain/photo-crop";
import type { PhotoCrop } from "./media-http";

type PhotoKind = keyof typeof photoRatios;

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The crop area in percent of the preview. The stage is always `dir="ltr"`: photos never mirror. */
export interface CropFrame {
  readonly startPercent: number;
  readonly topPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
}

const focalMaximum = 10_000;
const zoomMinimum = 100;
const zoomMaximum = 400;
const steps = {
  focal: { small: 250, large: 1_000 },
  zoom: { small: 10, large: 50 },
} as const;

export const centredCrop: PhotoCrop = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function moveFocal(crop: PhotoCrop, deltaX: number, deltaY: number): PhotoCrop {
  return {
    ...crop,
    focalX: clamp(crop.focalX + deltaX, 0, focalMaximum),
    focalY: clamp(crop.focalY + deltaY, 0, focalMaximum),
  };
}

function zoomBy(crop: PhotoCrop, delta: number): PhotoCrop {
  return { ...crop, zoomPercent: clamp(crop.zoomPercent + delta, zoomMinimum, zoomMaximum) };
}

type CropKeyAction = (crop: PhotoCrop, step: { focal: number; zoom: number }) => PhotoCrop;

const keyActions: Readonly<Record<string, CropKeyAction>> = {
  ArrowLeft: (crop, { focal }) => moveFocal(crop, -focal, 0),
  ArrowRight: (crop, { focal }) => moveFocal(crop, focal, 0),
  ArrowUp: (crop, { focal }) => moveFocal(crop, 0, -focal),
  ArrowDown: (crop, { focal }) => moveFocal(crop, 0, focal),
  "+": (crop, { zoom }) => zoomBy(crop, zoom),
  "=": (crop, { zoom }) => zoomBy(crop, zoom),
  "-": (crop, { zoom }) => zoomBy(crop, -zoom),
  Home: () => centredCrop,
};

/** The crop after a key press, or `undefined` when the cropper does not handle the key. */
export function nudgeCrop(
  crop: PhotoCrop,
  { key, isLarge }: { key: string; isLarge: boolean },
): PhotoCrop | undefined {
  const action = Object.hasOwn(keyActions, key) ? keyActions[key] : undefined;
  if (!action) return undefined;
  const size = isLarge ? "large" : "small";
  return action(crop, { focal: steps.focal[size], zoom: steps.zoom[size] });
}

function percentOf(part: number, whole: number): number {
  return Math.round((part * 10_000) / whole) / 100;
}

/** The exact area the worker will cut (shared `cropRectangle`), relative to the preview. */
export function cropFrame(preview: Size, kind: PhotoKind, crop: PhotoCrop): CropFrame {
  const area = cropRectangle(preview, photoRatios[kind], crop);
  return {
    startPercent: percentOf(area.left, preview.width),
    topPercent: percentOf(area.top, preview.height),
    widthPercent: percentOf(area.width, preview.width),
    heightPercent: percentOf(area.height, preview.height),
  };
}
