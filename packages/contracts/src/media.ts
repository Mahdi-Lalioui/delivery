import { z } from "zod";

export const photoUploadMaximumBytes = 8 * 1024 * 1024;
export const photoVariantWidths = [160, 320, 640, 960, 1280] as const;
export const photoRatios = {
  application: { width: 16, height: 9 },
  cover: { width: 16, height: 9 },
  item: { width: 4, height: 3 },
  logo: { width: 1, height: 1 },
} as const;

const merchantPhotoKind = z.enum(["cover", "item", "logo"]);
const photoKind = z.enum(["application", ...merchantPhotoKind.options]);
const uploadFields = {
  contentType: z.enum(["image/jpeg", "image/png", "image/heic", "image/webp"]),
  bytes: z.int().positive().max(photoUploadMaximumBytes),
};

export const mediaUploadInput = z.discriminatedUnion("kind", [
  z.strictObject({ ...uploadFields, kind: z.literal("application") }),
  z.strictObject({ ...uploadFields, kind: merchantPhotoKind, merchantId: z.uuid() }),
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

const thumbhash = z.base64().min(8).max(64);

// Published variants are served from the public media path; nothing else in storage is (§16).
export const publishedPhoto = z.strictObject({
  thumbhash,
  variants: z
    .array(
      variants.extend({
        url: z.string().regex(/^\/media\/[0-9a-f-]{36}\/(160|320|640|960|1280)\.(avif|webp)$/),
      }),
    )
    .length(photoVariantWidths.length * 2),
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
      thumbhash,
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
