import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ApplicationPhotoField } from "../src/merchant/components/application-photo-field";

const sessionId = "019d6abc-1234-7234-8234-123456789001";
const photoId = "019d6abc-1234-7234-8234-123456789006";

function render(locale: "ar" | "fr", attached: string | null) {
  const messages = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Africa/Algiers"
      messages={{
        merchant: messages.merchant,
        photoUpload: messages.photoUpload,
        photoCrop: messages.photoCrop,
      }}
    >
      <ApplicationPhotoField sessionId={sessionId} photoId={attached} onPhotoChange={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

test("[MER-01:web] offers an optional restaurant photo picker inside a labelled group", () => {
  const { merchant, photoUpload } = getMessages("fr");
  const html = render("fr", null);
  expect(html).toContain(`<legend>${merchant.photo}</legend>`);
  expect(html).toContain(photoUpload.choose);
  expect(html).not.toContain(merchant.removePhoto);
});

test("[MER-01:web] shows an attached application photo with a remove action", () => {
  const { merchant } = getMessages("ar");
  const html = render("ar", photoId);
  expect(html).toContain(merchant.photoAttached);
  expect(html).toContain(merchant.removePhoto);
  expect(html).toContain("data-application-photo-remove");
});
