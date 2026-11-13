import { getLocalizedContent } from "@zaafran/i18n/content";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { MenuPreview } from "../menu-preview-http";
import { MenuPreviewPhoto } from "./menu-preview-photo";

type PreviewCategory = MenuPreview["categories"][number];
type PreviewItem = PreviewCategory["items"][number];

const tagLabels = [
  ["spicy", "spicy"],
  ["vegetarian", "vegetarian"],
  ["new", "newTag"],
  ["popular", "popular"],
] as const;

function PreviewItemRow({ item, locale }: { item: PreviewItem; locale: Locale }) {
  const translate = useTranslations("menuPreview");
  const description = getLocalizedContent(item.descriptions, locale);
  const tags = tagLabels.filter(([tag]) => item.tags.includes(tag));

  return (
    <li className="menu-preview-item" data-available={item.isAvailable}>
      {item.photo && <MenuPreviewPhoto photo={item.photo} />}
      <div className="menu-preview-summary">
        <h3>
          <bdi>{getLocalizedContent(item.names, locale) ?? ""}</bdi>
        </h3>
        <p className="menu-preview-price">
          <bdi>{formatDzd(item.priceDzd, locale)}</bdi>
        </p>
      </div>
      {description && (
        <p className="menu-preview-description" dir="auto">
          {description}
        </p>
      )}
      {tags.length > 0 && (
        <ul className="menu-preview-tags" role="list" aria-label={translate("tags")}>
          {tags.map(([tag, label]) => (
            <li key={tag}>{translate(label)}</li>
          ))}
        </ul>
      )}
      {!item.isAvailable && <p className="menu-preview-sold-out">{translate("soldOut")}</p>}
    </li>
  );
}

function PreviewCategorySection({
  category,
  locale,
}: {
  category: PreviewCategory;
  locale: Locale;
}) {
  const headingId = `menu-preview-category-${category.categoryId}`;
  return (
    <section className="menu-preview-category" aria-labelledby={headingId}>
      <h2 id={headingId}>
        <bdi>{getLocalizedContent(category.names, locale) ?? ""}</bdi>
      </h2>
      <ul className="menu-preview-items" role="list">
        {category.items.map((item) => (
          <PreviewItemRow key={item.itemId} item={item} locale={locale} />
        ))}
      </ul>
    </section>
  );
}

export function MenuPreviewList({ preview, locale }: { preview: MenuPreview; locale: Locale }) {
  const translate = useTranslations("menuPreview");
  if (preview.categories.length === 0) {
    return <p className="menu-preview-empty">{translate("empty")}</p>;
  }
  return (
    <div className="menu-preview-categories" role="region" aria-label={translate("categories")}>
      {preview.categories.map((category) => (
        <PreviewCategorySection key={category.categoryId} category={category} locale={locale} />
      ))}
    </div>
  );
}
