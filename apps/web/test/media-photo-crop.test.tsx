import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CropControls } from "../src/media-photo/crop-controls";
import { cropRegion } from "../src/media-photo/crop-region";
import { MediaPhotoField } from "../src/media-photo/media-photo-field";

const expectedSessionId = "019d6abc-1234-7234-8234-123456789000";
const crop = { focalX: 5000, focalY: 5000, zoomPercent: 100 };

test("[MER-14:web] previews the centered item crop and clamps zoomed application edges", () => {
  expect(cropRegion({ width: 1200, height: 600 }, "item", crop)).toEqual({
    left: 200,
    top: 0,
    width: 800,
    height: 600,
  });
  expect(
    cropRegion({ width: 1600, height: 1200 }, "application", {
      focalX: 10000,
      focalY: 0,
      zoomPercent: 200,
    }),
  ).toEqual({ left: 800, top: 0, width: 800, height: 450 });
});

test("[MER-14:web] uses named keyboard sliders and an explicit crop button in Arabic", () => {
  const messages = getMessages("ar");
  const markup = renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={messages}>
      <CropControls
        kind="application"
        photo={{ width: 640, height: 480, blob: new Blob() }}
        onApply={() => undefined}
      />
    </NextIntlClientProvider>,
  );
  expect(markup.match(/type="range"/g)).toHaveLength(3);
  expect(markup).toContain(messages.mediaPhoto.focalX);
  expect(markup).toContain(messages.mediaPhoto.focalY);
  expect(markup).toContain(messages.mediaPhoto.zoom);
  expect(markup).toContain('width="640" height="360"');
  expect(markup).toMatch(/<button[^>]*type="button"[^>]*>[^<]+<\/button>/);
});

test("[MER-14:web] labels repeated application photo fields with distinct input IDs", () => {
  const messages = getMessages("fr");
  const field = { kind: "application" as const, expectedSessionId, mediaId: null };
  const markup = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr-DZ" timeZone="Africa/Algiers" messages={messages}>
      <MediaPhotoField {...field} onChange={() => undefined} />
      <MediaPhotoField {...field} onChange={() => undefined} />
    </NextIntlClientProvider>,
  );
  const labels = Array.from(markup.matchAll(/<label for="([^"]+)"/g), (match) => match[1]);
  const inputs = Array.from(
    markup.matchAll(/<input id="([^"]+)"[^>]*type="file"/g),
    (match) => match[1],
  );
  expect(new Set(labels).size).toBe(2);
  expect(inputs).toEqual(labels);
  expect(markup).toContain(messages.mediaPhoto.guide);
});
