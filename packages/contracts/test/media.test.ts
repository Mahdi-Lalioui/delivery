import { expect, test } from "vitest";
import { mediaCropInput, mediaOutput, mediaUploadInput } from "../src/media.js";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const mediaId = "019d6abc-1234-7234-8234-123456789001";
const sessionId = "019d6abc-1234-7234-8234-123456789002";
const maximumBytes = 8 * 1024 * 1024;
const upload = { kind: "item", merchantId, contentType: "image/heic", bytes: maximumBytes };

test("[MER-14:contract] accepts only the four photo MIME types within the inclusive byte limit", () => {
  for (const contentType of ["image/jpeg", "image/png", "image/heic", "image/webp"]) {
    expect(mediaUploadInput.parse({ ...upload, contentType })).toEqual({ ...upload, contentType });
  }
  for (const bytes of [0, -1, 3.5, maximumBytes + 1]) {
    expect(mediaUploadInput.safeParse({ ...upload, bytes }).success).toBe(false);
  }
  for (const contentType of ["image/svg+xml", "image/avif", "image/heic; charset=utf-8"]) {
    expect(mediaUploadInput.safeParse({ ...upload, contentType }).success).toBe(false);
  }
  expect(mediaUploadInput.safeParse({ ...upload, data: "binary belongs in PUT" }).success).toBe(
    false,
  );
});

test("[MER-14:contract] distinguishes private applications from restaurant-owned images", () => {
  const application = { kind: "application", contentType: "image/png", bytes: 1 };
  expect(mediaUploadInput.parse(application)).toEqual(application);
  expect(mediaUploadInput.safeParse({ ...application, merchantId }).success).toBe(false);
  for (const kind of ["item", "cover", "logo"]) {
    expect(mediaUploadInput.safeParse({ ...application, kind }).success).toBe(false);
    expect(mediaUploadInput.safeParse({ ...application, kind, merchantId }).success).toBe(true);
  }
});

test("[MER-14:contract] expresses a focal point and zoom using bounded integer units", () => {
  const crop = { focalX: 0, focalY: 10_000, zoomPercent: 100 };
  expect(mediaCropInput.parse(crop)).toEqual(crop);
  expect(mediaCropInput.parse({ ...crop, zoomPercent: 400 }).zoomPercent).toBe(400);
  for (const change of [
    { focalX: -1 },
    { focalY: 10_001 },
    { focalX: 0.5 },
    { zoomPercent: 99 },
    { zoomPercent: 401 },
    { path: "../quarantine" },
  ]) {
    expect(mediaCropInput.safeParse({ ...crop, ...change }).success).toBe(false);
  }
});

const identity = { mediaId, sessionId, kind: "item" };

test("[MER-14:contract] isolates preview metadata and a stable rejection reason to their own states", () => {
  const preview = { ...identity, status: "awaiting_crop", width: 640, height: 480 };
  expect(mediaOutput.parse(preview)).toEqual(preview);
  expect(mediaOutput.safeParse({ ...preview, height: 1281 }).success).toBe(false);
  expect(mediaOutput.safeParse({ ...preview, sourcePath: "/quarantine/private" }).success).toBe(
    false,
  );
  for (const status of ["awaiting_upload", "preparing", "processing"]) {
    expect(mediaOutput.parse({ ...identity, status })).toEqual({ ...identity, status });
    expect(mediaOutput.safeParse({ ...preview, status }).success).toBe(false);
  }
  const rejected = { ...identity, status: "rejected", reason: "content_type_mismatch" };
  expect(mediaOutput.parse(rejected)).toEqual(rejected);
  expect(mediaOutput.safeParse({ ...rejected, reason: "private stack trace" }).success).toBe(false);
});

test("[MER-14:contract] publishes each required width in both formats with the kind's aspect ratio", () => {
  for (const [kind, ratio] of [
    ["item", 3 / 4],
    ["cover", 9 / 16],
    ["logo", 1],
    ["application", 9 / 16],
  ] as const) {
    const variants = [160, 320, 640, 960, 1280].flatMap((width) =>
      ["avif", "webp"].map((format) => ({ format, width, height: width * ratio, bytes: 123 })),
    );
    const ready = { ...identity, kind, status: "ready", thumbhash: "/wAAAQIDBAUGBw==", variants };
    expect(mediaOutput.parse(ready)).toEqual(ready);
    expect(mediaOutput.safeParse({ ...ready, variants: variants.slice(1) }).success).toBe(false);
    expect(
      mediaOutput.safeParse({
        ...ready,
        variants: variants.map((variant) => ({ ...variant, format: "webp" })),
      }).success,
    ).toBe(false);
    expect(
      mediaOutput.safeParse({
        ...ready,
        variants: variants.map((variant) => ({ ...variant, height: variant.height + 1 })),
      }).success,
    ).toBe(false);
    expect(mediaOutput.safeParse({ ...ready, thumbhash: "hello world!" }).success).toBe(false);
    expect(mediaOutput.safeParse({ ...ready, thumbhash: "_wAAAQIDBAUGBw" }).success).toBe(false);
  }
});
