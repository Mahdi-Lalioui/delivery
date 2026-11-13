import { photoVariantWidths } from "@zaafran/contracts/media";
import { expect, test } from "vitest";
import { centredCrop } from "../src/media/crop-editor";
import { initialPhotoState, reducePhoto, type PhotoState } from "../src/media/photo-state";

const identity = {
  mediaId: "0b7f3f5e-8a7b-4c39-9d9e-5d0f0a6e2a11",
  sessionId: "4f1c2b8e-1d2a-4e5f-9a7b-3c6d8e0f1a22",
  kind: "item",
} as const;
const awaitingCrop = { ...identity, status: "awaiting_crop", width: 1280, height: 720 } as const;
const variants = photoVariantWidths.flatMap((width) =>
  (["avif", "webp"] as const).map((format) => ({
    format,
    width,
    height: (width * 3) / 4,
    bytes: 1_000,
  })),
);
const ready = { ...identity, status: "ready", variants, thumbhash: "AAAAAAAAAAAA" } as const;
const moved = { focalX: 2_000, focalY: 3_000, zoomPercent: 150 };
const cropping: PhotoState = { kind: "cropping", photo: awaitingCrop, crop: moved };

test("[MER-14:flow] a chosen file uploads, then opens the cropper centred", () => {
  const uploading = reducePhoto(initialPhotoState, { kind: "choose" });
  expect(uploading).toEqual({ kind: "uploading" });
  expect(
    reducePhoto(uploading, { kind: "uploaded", step: { kind: "crop", photo: awaitingCrop } }),
  ).toEqual({ kind: "cropping", photo: awaitingCrop, crop: centredCrop });
});

test.each([
  { kind: "too-large" },
  { kind: "unsupported-type" },
  { kind: "rejected", reason: "invalid_image" },
  { kind: "timed-out" },
  { kind: "error", shouldRetry: true },
  { kind: "forbidden" },
] as const)("[MER-14:flow] an upload ending in $kind returns to the picker with it", (step) => {
  const state = reducePhoto({ kind: "uploading" }, { kind: "uploaded", step });
  expect(state).toEqual({ kind: "idle", failure: step });
});

test("[MER-14:flow] adjusts only while cropping and saves the chosen crop", () => {
  expect(reducePhoto(cropping, { kind: "adjust", crop: centredCrop })).toEqual({
    ...cropping,
    crop: centredCrop,
  });
  expect(reducePhoto({ kind: "uploading" }, { kind: "adjust", crop: moved })).toEqual({
    kind: "uploading",
  });
  expect(reducePhoto(cropping, { kind: "confirm" })).toEqual({
    kind: "saving",
    photo: awaitingCrop,
    crop: moved,
  });
});

test("[MER-14:flow] a saved crop reaches ready", () => {
  const saving = reducePhoto(cropping, { kind: "confirm" });
  expect(reducePhoto(saving, { kind: "cropped", step: { kind: "ready", photo: ready } })).toEqual({
    kind: "ready",
    photo: ready,
  });
});

test.each([
  { kind: "timed-out" },
  { kind: "error", shouldRetry: true },
  { kind: "rate-limited", shouldRetry: true },
] as const)("[MER-14:flow] a $kind crop save keeps the same crop for a retry", (step) => {
  const saving = reducePhoto(cropping, { kind: "confirm" });
  expect(reducePhoto(saving, { kind: "cropped", step })).toEqual({ ...cropping, failure: step });
});

test.each([
  { kind: "rejected", reason: "image_too_large" },
  { kind: "crop-unavailable" },
  { kind: "sign-in" },
] as const)("[MER-14:flow] a final $kind crop failure returns to the picker", (step) => {
  const saving = reducePhoto(cropping, { kind: "confirm" });
  expect(reducePhoto(saving, { kind: "cropped", step })).toEqual({ kind: "idle", failure: step });
});

test("[MER-14:flow] ignores out-of-order results and resets from any state", () => {
  const late = { kind: "uploaded", step: { kind: "crop", photo: awaitingCrop } } as const;
  expect(reducePhoto(initialPhotoState, late)).toBe(initialPhotoState);
  expect(reducePhoto(cropping, { kind: "cropped", step: { kind: "ready", photo: ready } })).toBe(
    cropping,
  );
  expect(reducePhoto(cropping, { kind: "choose" })).toBe(cropping);
  expect(reducePhoto({ kind: "ready", photo: ready }, { kind: "choose" })).toEqual({
    kind: "uploading",
  });
  expect(reducePhoto(cropping, { kind: "reset" })).toEqual(initialPhotoState);
});
