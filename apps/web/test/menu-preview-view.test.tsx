import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MenuPreviewCard } from "../src/menu-item/components/menu-preview-card";
import { MenuPreviewOptions } from "../src/menu-item/components/menu-preview-options";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const itemId = "019d6abc-1234-7234-8234-123456789001";
const photoId = "019d6abc-1234-7234-8234-123456789002";
const sessionId = "019d6abc-1234-7234-8234-123456789003";
const optionId = "019d6abc-1234-7234-8234-123456789004";
const optionGroupId = "019d6abc-1234-7234-8234-123456789005";
const expected = { sessionId, revision: 9 };
const messages = getMessages("ar");

test("[ADM-04] renders a customer card with translated tags, fallback content and a private lazy photo", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={messages}>
      <MenuPreviewCard
        item={{
          itemId,
          names: { fr: "Poulet grillé" },
          descriptions: { fr: "Riz et légumes" },
          priceDzd: 1200,
          isAvailable: false,
          tags: ["spicy"],
          photoId,
        }}
        merchantId={merchantId}
        expected={expected}
        locale="ar"
        onFailure={() => undefined}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("<bdi>Poulet grillé</bdi>");
  expect(html).toContain("Riz et légumes");
  expect(html).toContain("1\u202f200 دج");
  expect(html).toContain(messages.menuItem.spicy);
  expect(html).toContain(messages.menuItem.stockSoldOut);
  expect(html).toContain(`/v1/media/${photoId}/variants/webp/320`);
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('width="320" height="240"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain(messages.menuPreview.optionsTitle);
});

test("[MER-10] shows option group limits, positive deltas and unavailable options", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={messages}>
      <MenuPreviewOptions
        locale="ar"
        groups={[
          {
            optionGroupId,
            names: { fr: "Sauces" },
            minimum: 0,
            maximum: 1,
            options: [
              {
                optionId,
                names: { ar: "هريسة" },
                priceDeltaDzd: 150,
                isDefault: true,
                isAvailable: false,
              },
            ],
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("<bdi>Sauces</bdi>");
  expect(html).toContain("<bdi>هريسة</bdi>");
  expect(html).toContain("150 دج");
  expect(html).toContain(messages.menuPreview.defaultOption);
  expect(html).toContain(messages.menuItem.stockSoldOut);
});
