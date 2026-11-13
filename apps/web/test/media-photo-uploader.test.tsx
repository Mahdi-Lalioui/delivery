import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { PhotoUploader, type PhotoUploaderProps } from "../src/media/components/photo-uploader";
import type { PhotoState } from "../src/media/photo-state";

const mediaId = "019d6abc-1234-7234-8234-123456789002";
const identity = {
  mediaId,
  sessionId: "019d6abc-1234-7234-8234-123456789001",
  kind: "item",
} as const;
const awaitingCrop = { ...identity, status: "awaiting_crop", width: 1280, height: 720 } as const;
const crop = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };

function render(
  locale: "ar" | "fr",
  state: PhotoState,
  overrides: Partial<PhotoUploaderProps> = {},
) {
  const props: PhotoUploaderProps = {
    kind: "item",
    state,
    onChoose: vi.fn(),
    onCropChange: vi.fn(),
    onConfirm: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  const messages = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Africa/Algiers"
      messages={{ photoUpload: messages.photoUpload, photoCrop: messages.photoCrop }}
    >
      <PhotoUploader {...props} />
    </NextIntlClientProvider>,
  );
}

test("[MER-14:ui] offers a labelled picker for the four accepted types with the photo guide", () => {
  const { photoUpload } = getMessages("fr");
  const html = render("fr", { kind: "idle" });
  expect(html).toContain('type="file"');
  expect(html).toContain('accept="image/jpeg,image/png,image/heic,image/webp"');
  expect(html).toContain(photoUpload.choose);
  expect(html).toContain(photoUpload.guideLight);
  expect(html).toContain(photoUpload.guideNoText);
  expect(html).toContain(photoUpload.limits);
  expect(html).not.toContain('role="alert"');
});

test.each([
  [{ kind: "too-large" }, "tooLarge"],
  [{ kind: "unsupported-type" }, "unsupportedType"],
  [{ kind: "rejected", reason: "invalid_image" }, "invalidImage"],
  [{ kind: "rejected", reason: "content_type_mismatch" }, "invalidImage"],
  [{ kind: "rejected", reason: "image_too_large" }, "imageTooLarge"],
  [{ kind: "timed-out" }, "timedOut"],
  [{ kind: "rate-limited", shouldRetry: true }, "rateLimited"],
  [{ kind: "sign-in" }, "signInRequired"],
  [{ kind: "forbidden" }, "forbidden"],
  [{ kind: "session-changed" }, "sessionChanged"],
  [{ kind: "crop-conflict" }, "error"],
] as const)("[MER-14:ui] explains the %o failure", (failure, key) => {
  const html = render("ar", { kind: "idle", failure });
  expect(html).toContain('role="alert"');
  expect(html).toContain(getMessages("ar").photoUpload[key]);
});

test("[MER-14:ui] shows progress while the photo is uploaded and prepared", () => {
  const { photoUpload } = getMessages("fr");
  const html = render("fr", { kind: "uploading" });
  expect(html).toContain('role="status"');
  expect(html).toContain(photoUpload.uploading);
  expect(html).not.toContain('type="file"');
});

test("[MER-14:ui] opens the cropper on the private preview and keeps a retryable failure", () => {
  const { photoUpload, photoCrop } = getMessages("fr");
  const html = render("fr", {
    kind: "cropping",
    photo: awaitingCrop,
    crop,
    failure: { kind: "timed-out" },
  });
  expect(html).toContain(`src="/v1/media/${mediaId}/preview"`);
  expect(html).toContain(photoCrop.confirm);
  expect(html).toContain(photoUpload.timedOut);
  expect(html).toContain(photoUpload.chooseAnother);
});

test("[MER-14:ui] confirms a ready photo and lets the owner replace it", () => {
  const { photoUpload } = getMessages("ar");
  const html = render("ar", {
    kind: "ready",
    photo: { ...identity, status: "ready", variants: [], thumbhash: "AAAAAAAAAAAA" },
  });
  expect(html).toContain(photoUpload.ready);
  expect(html).toContain(photoUpload.chooseAnother);
});
