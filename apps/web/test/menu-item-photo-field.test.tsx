import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ItemPhotoField } from "../src/menu-item/components/item-photo-field";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const photoId = "019d6abc-1234-7234-8234-123456789006";

function render(locale: "ar" | "fr", attached: string | null, isDisabled = false) {
  const messages = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Africa/Algiers"
      messages={{
        menuItem: messages.menuItem,
        photoUpload: messages.photoUpload,
        photoCrop: messages.photoCrop,
      }}
    >
      <ItemPhotoField
        merchantId={merchantId}
        sessionId={sessionId}
        photoId={attached}
        isDisabled={isDisabled}
        onPhotoChange={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

test("[MER-14:items] offers the 4:3 photo picker inside a labelled group", () => {
  const { menuItem, photoUpload } = getMessages("fr");
  const html = render("fr", null);
  expect(html).toContain(`<legend>${menuItem.photo}</legend>`);
  expect(html).toContain(photoUpload.choose);
  expect(html).not.toContain(menuItem.removePhoto);
});

test("[MER-14:items] shows an attached photo with a remove action and a replacement picker", () => {
  const { menuItem, photoUpload } = getMessages("ar");
  const html = render("ar", photoId);
  expect(html).toContain(menuItem.photoAttached);
  expect(html).toContain(menuItem.removePhoto);
  expect(html).toContain("data-item-photo-remove");
  expect(html).toContain(photoUpload.choose);
});

test("[MER-14:items] locks the photo controls while the item is being saved", () => {
  expect(render("fr", photoId, true)).toMatch(/^<fieldset[^>]*disabled=""/);
  expect(render("fr", photoId)).not.toMatch(/^<fieldset[^>]*disabled=""/);
});
