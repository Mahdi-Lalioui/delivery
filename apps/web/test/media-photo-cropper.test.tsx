import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { PhotoCropper, type PhotoCropperProps } from "../src/media/components/photo-cropper";

const mediaId = "0b7f3f5e-8a7b-4c39-9d9e-5d0f0a6e2a11";

function render(locale: "ar" | "fr", overrides: Partial<PhotoCropperProps> = {}) {
  const props: PhotoCropperProps = {
    kind: "item",
    preview: { url: `/v1/media/${mediaId}/preview`, width: 1280, height: 720 },
    crop: { focalX: 5_000, focalY: 5_000, zoomPercent: 100 },
    isSaving: false,
    onCropChange: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Africa/Algiers"
      messages={{ photoCrop: getMessages(locale).photoCrop }}
    >
      <PhotoCropper {...props} />
    </NextIntlClientProvider>,
  );
}

test("[MER-14:crop] shows the private preview at its size with a focusable, described stage", () => {
  const { photoCrop } = getMessages("fr");
  const html = render("fr");
  expect(html).toContain(`src="/v1/media/${mediaId}/preview"`);
  expect(html).toContain('width="1280"');
  expect(html).toContain('height="720"');
  expect(html).toContain(`alt="${photoCrop.previewAlt}"`);
  expect(html).toMatch(/data-crop-stage[^>]*tabindex="0"|tabindex="0"[^>]*data-crop-stage/);
  expect(html).toContain(photoCrop.instructions);
  expect(html).toContain('aria-describedby="');
});

test("[MER-14:crop] draws the worker's cut area with SVG attributes, never inline styles", () => {
  const html = render("ar", { kind: "logo", crop: { focalX: 0, focalY: 5_000, zoomPercent: 100 } });
  expect(html).toContain('data-crop-frame=""');
  expect(html).toMatch(/<rect[^>]*data-crop-frame=""[^>]*x="0"[^>]*y="0"[^>]*width="56.25"/);
  expect(html).not.toContain("style=");
});

test("[MER-14:crop] keeps the photo unmirrored in Arabic while the controls follow the page", () => {
  const { photoCrop } = getMessages("ar");
  const html = render("ar");
  expect(html).toMatch(/data-crop-stage[^>]*dir="ltr"|dir="ltr"[^>]*data-crop-stage/);
  expect(html).toContain(photoCrop.zoomIn);
  expect(html).toContain(photoCrop.zoomOut);
  expect(html).toContain(photoCrop.recentre);
  expect(html).toContain(photoCrop.confirm);
});

test("[MER-14:crop] announces the focal point and zoom", () => {
  const html = render("fr", { crop: { focalX: 2_500, focalY: 7_500, zoomPercent: 150 } });
  expect(html).toContain('role="status"');
  expect(html).toMatch(/25[^<]*75[^<]*150/);
});

test("[MER-14:crop] disables every control while the crop is saved", () => {
  const { photoCrop } = getMessages("fr");
  const html = render("fr", { isSaving: true });
  expect(html).toContain("<fieldset disabled");
  expect(html).toContain(photoCrop.saving);
  expect(html).toMatch(/data-crop-stage[^>]*tabindex="-1"|tabindex="-1"[^>]*data-crop-stage/);
});

test("[MER-14:crop] limits the zoom buttons at 100 % and 400 %", () => {
  const atMinimum = render("fr");
  expect(atMinimum).toMatch(/<button[^>]*disabled=""[^>]*data-crop-zoom-out/);
  const atMaximum = render("fr", { crop: { focalX: 5_000, focalY: 5_000, zoomPercent: 400 } });
  expect(atMaximum).toMatch(/<button[^>]*disabled=""[^>]*data-crop-zoom-in/);
});
