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
          photo: null,
        },
        {
          itemId: "019d6abc-1234-7234-8234-123456789013",
          names: { fr: "Chorba fictive" },
          descriptions: { fr: "Soupe" },
          priceDzd: 300,
          tags: [],
          isAvailable: false,
          soldOutUntil: null,
          photo: null,
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

const photoId = "019d6abc-1234-7234-8234-123456789099";
const widths = [160, 320, 640, 960, 1280] as const;
const publishedPhoto = {
  thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
  variants: (["avif", "webp"] as const).flatMap((format) =>
    widths.map((width) => ({
      format,
      width,
      height: (width * 3) / 4,
      bytes: width * 10,
      url: `/media/${photoId}/${String(width)}.${format}`,
    })),
  ),
};

function withPhoto(): MenuPreview {
  const [category] = preview.categories;
  const [first, second] = category?.items ?? [];
  if (!category || !first || !second) throw new Error("The preview fixture lost its items.");
  return {
    ...preview,
    categories: [{ ...category, items: [{ ...first, photo: publishedPhoto }, second] }],
  };
}

test("[MER-14] shows a published item photo as AVIF and WebP sources without layout shift", () => {
  const html = render("fr", withPhoto());
  const srcset = (format: "avif" | "webp") =>
    widths
      .map((width) => `/media/${photoId}/${String(width)}.${format} ${String(width)}w`)
      .join(", ");

  expect(html.match(/<picture/g)).toHaveLength(1);
  expect(html.match(/<img [^>]*\/media\//g)).toHaveLength(1);
  expect(html).toContain(`<source type="image/avif" srcSet="${srcset("avif")}"`);
  expect(html).toContain(`<source type="image/webp" srcSet="${srcset("webp")}"`);
  const image = (html.match(/<img [^>]*>/g) ?? []).find((tag) => tag.includes("/media/")) ?? "";
  expect(image).toContain(`src="/media/${photoId}/640.webp"`);
  expect(image).toContain('width="1280"');
  expect(image).toContain('height="960"');
  expect(image).toContain('alt=""');
  expect(image).toContain('loading="lazy"');
  expect(image).toContain('decoding="async"');
});

test("[MER-14] paints the ThumbHash placeholder under the photo until it loads", () => {
  const html = render("fr", withPhoto());
  const images = html.match(/<img [^>]*>/g) ?? [];

  expect(images).toHaveLength(2);
  const [placeholder, photo] = images;
  expect(placeholder).toContain('class="menu-preview-placeholder"');
  expect(placeholder).toMatch(/src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
  expect(placeholder).toContain('alt=""');
  expect(placeholder).toContain('aria-hidden="true"');
  expect(photo).toContain(`src="/media/${photoId}/640.webp"`);
});

test("[MER-14] renders no image for an item without a published photo", () => {
  expect(render("fr")).not.toContain("<img");
  expect(render("fr")).not.toContain("<picture");
});
