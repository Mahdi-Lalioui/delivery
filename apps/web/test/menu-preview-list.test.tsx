import { formatDzd } from "@zaafran/i18n/formats";
import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MenuPreviewList } from "../src/menu-preview/components/menu-preview-list";
import type { MenuPreview } from "../src/menu-preview/menu-preview-http";

const preview: MenuPreview = {
  revision: 2,
  restaurantName: "Restaurant fictif",
  categories: [
    {
      categoryId: "019d6abc-1234-7234-8234-123456789011",
      names: { ar: "أطباق", fr: "Plats" },
      items: [
        {
          itemId: "019d6abc-1234-7234-8234-123456789012",
          names: { ar: "كسكس", fr: "Couscous fictif" },
          descriptions: { fr: "Semoule et légumes" },
          priceDzd: 1250,
          tags: ["spicy"],
          isAvailable: true,
          soldOutUntil: null,
        },
        {
          itemId: "019d6abc-1234-7234-8234-123456789013",
          names: { fr: "Chorba fictive" },
          descriptions: { fr: "Soupe" },
          priceDzd: 300,
          tags: [],
          isAvailable: false,
          soldOutUntil: null,
        },
      ],
    },
  ],
};

function render(locale: "ar" | "fr", data: MenuPreview = preview) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
      <MenuPreviewList preview={data} locale={locale} />
    </NextIntlClientProvider>,
  );
}

test("[ADM-04] shows each listable item under its category with the localized price", () => {
  const { menuPreview } = getMessages("fr");
  const html = render("fr");

  expect(html).toContain('<h2 id="menu-preview-category-019d6abc-1234-7234-8234-123456789011">');
  expect(html).toContain("<bdi>Plats</bdi>");
  expect(html).toContain("<bdi>Couscous fictif</bdi>");
  expect(html).toContain(`<bdi>${formatDzd(1250, "fr")}</bdi>`);
  expect(html).toContain('<p class="menu-preview-description" dir="auto">Semoule et légumes</p>');
  expect(html).toContain(`<li>${menuPreview.spicy}</li>`);
  expect(html.match(new RegExp(menuPreview.soldOut, "g"))).toHaveLength(1);
});

test("[ADM-04] uses Arabic names and the Arabic dinar unit, falling back to French", () => {
  const html = render("ar");

  expect(html).toContain("<bdi>أطباق</bdi>");
  expect(html).toContain("<bdi>كسكس</bdi>");
  expect(html).toContain(`<bdi>${formatDzd(1250, "ar")}</bdi>`);
  expect(html).toContain("<bdi>Chorba fictive</bdi>");
});

test("[ADM-04] explains an empty preview instead of rendering empty categories", () => {
  const { menuPreview } = getMessages("fr");
  const html = render("fr", { ...preview, categories: [] });

  expect(html).toContain(menuPreview.empty);
  expect(html).not.toContain("<h2");
});
