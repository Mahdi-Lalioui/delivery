import { centredCrop } from "./crop-editor";
import type { PhotoCrop } from "./media-http";
import type { PhotoCropStep, PhotoUploadStep } from "./media-flow";

type AwaitingCrop = Extract<PhotoUploadStep, { kind: "crop" }>["photo"];
type ReadyPhoto = Extract<PhotoCropStep, { kind: "ready" }>["photo"];
type UploadFailure = Exclude<PhotoUploadStep, { kind: "crop" }>;
type CropFailure = Exclude<PhotoCropStep, { kind: "ready" }>;

export type PhotoState =
  | { kind: "idle"; failure?: UploadFailure | CropFailure }
  | { kind: "uploading" }
  | { kind: "cropping"; photo: AwaitingCrop; crop: PhotoCrop; failure?: CropFailure }
  | { kind: "saving"; photo: AwaitingCrop; crop: PhotoCrop }
  | { kind: "ready"; photo: ReadyPhoto };

export type PhotoEvent =
  | { kind: "choose" | "confirm" | "reset" }
  | { kind: "uploaded"; step: PhotoUploadStep }
  | { kind: "adjust"; crop: PhotoCrop }
  | { kind: "cropped"; step: PhotoCropStep };

export const initialPhotoState: PhotoState = { kind: "idle" };

// The same crop replays safely, so these failures keep the cropper open for a retry.
const retryableCropFailures = new Set<CropFailure["kind"]>(["timed-out", "error", "rate-limited"]);

function afterUpload(state: PhotoState, step: PhotoUploadStep): PhotoState {
  if (state.kind !== "uploading") return state;
  if (step.kind !== "crop") return { kind: "idle", failure: step };
  return { kind: "cropping", photo: step.photo, crop: centredCrop };
}

function afterCrop(state: PhotoState, step: PhotoCropStep): PhotoState {
  if (state.kind !== "saving") return state;
  if (step.kind === "ready") return { kind: "ready", photo: step.photo };
  if (!retryableCropFailures.has(step.kind)) return { kind: "idle", failure: step };
  return { kind: "cropping", photo: state.photo, crop: state.crop, failure: step };
}

function adjust(state: PhotoState, crop: PhotoCrop): PhotoState {
  return state.kind === "cropping" ? { kind: "cropping", photo: state.photo, crop } : state;
}

function confirm(state: PhotoState): PhotoState {
  return state.kind === "cropping"
    ? { kind: "saving", photo: state.photo, crop: state.crop }
    : state;
}

/** Upload → crop → ready. Late or out-of-order results leave the state unchanged. */
export function reducePhoto(state: PhotoState, event: PhotoEvent): PhotoState {
  switch (event.kind) {
    case "choose":
      return state.kind === "idle" || state.kind === "ready" ? { kind: "uploading" } : state;
    case "uploaded":
      return afterUpload(state, event.step);
    case "adjust":
      return adjust(state, event.crop);
    case "confirm":
      return confirm(state);
    case "cropped":
      return afterCrop(state, event.step);
    case "reset":
      return initialPhotoState;
  }
}
