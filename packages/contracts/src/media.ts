import { z } from "./schema.js";

import { photoRatios, photoUploadMaximumBytes, photoVariantWidths } from "./media-constants.js";

export { photoRatios, photoUploadMaximumBytes, photoVariantWidths };

const merchantPhotoKind = z.enum(["cover", "item", "logo"]);
const photoKind = z.enum(["application", "delivery_proof", ...merchantPhotoKind.options]);
const uploadFields = {
  contentType: z.enum(["image/jpeg", "image/png", "image/heic", "image/webp"]),
  bytes: z.int().positive().max(photoUploadMaximumBytes),
};

export const mediaUploadInput = z.discriminatedUnion("kind", [
  z.strictObject({ ...uploadFields, kind: z.literal("application") }),
  z.strictObject({ ...uploadFields, kind: merchantPhotoKind, merchantId: z.uuid() }),
  z.strictObject({ ...uploadFields, kind: z.literal("delivery_proof"), orderId: z.uuid() }),
]);

const focalCoordinate = z.int().min(0).max(10_000);
export const mediaCropInput = z.strictObject({
  focalX: focalCoordinate,
  focalY: focalCoordinate,
  zoomPercent: z.int().min(100).max(400),
});

const identity = z.strictObject({ mediaId: z.uuid(), sessionId: z.uuid(), kind: photoKind });
const previewDimension = z.int().positive().max(1280);
const variants = z.strictObject({
  format: z.enum(["avif", "webp"]),
  width: z.literal(photoVariantWidths),
  height: previewDimension,
  bytes: z.int().positive(),
});

export const mediaOutput = z
  .discriminatedUnion("status", [
    identity.extend({ status: z.enum(["awaiting_upload", "preparing", "processing"]) }),
    identity.extend({
      status: z.literal("awaiting_crop"),
      width: previewDimension,
      height: previewDimension,
    }),
    identity.extend({
      status: z.literal("ready"),
      variants: z.array(variants).length(photoVariantWidths.length * 2),
      thumbhash: z.base64().min(8).max(64),
    }),
    identity.extend({
      status: z.literal("rejected"),
      reason: z.enum(["content_type_mismatch", "invalid_image", "image_too_large"]),
    }),
  ])
  .refine((value) => {
    if (value.status !== "ready") return true;
    const { width, height } = photoRatios[value.kind];
    const entries = new Set(
      value.variants.map(({ format, width }) => `${format}:${width.toString()}`),
    );
    return (
      entries.size === value.variants.length &&
      value.variants.every((variant) => variant.height * width === variant.width * height)
    );
  }, "Publish both formats at each width using the photo's aspect ratio.");
