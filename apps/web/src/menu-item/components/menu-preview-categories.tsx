import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { MenuCategory } from "../../menu-category/menu-category-http";
import { loadItemCategoryRail } from "../item-category-rail";
import type { PreviewScope } from "../menu-preview-http";
import type { OnPreviewFailure } from "../use-menu-preview-pages";

interface PreviewCategoriesProps extends PreviewScope {
  categoryId: string;
  initialCategoryId: string;
  locale: Locale;
  onSelect: (categoryId: string) => void;
  onFailure: OnPreviewFailure;
}

function CategoryControls({
  categories,
  categoryId,
  locale,
  onSelect,
}: Pick<PreviewCategoriesProps, "categoryId" | "locale" | "onSelect"> & {
  categories: MenuCategory[];
}) {
  const t = useTranslations("menuPreview");
  return (
    <nav className="menu-preview-category-nav" aria-label={t("categories")}>
      <ul role="list">
        {categories.map((category) => (
          <li key={category.categoryId}>
            <button
              type="button"
              className="menu-item-secondary"
              aria-pressed={category.categoryId === categoryId}
              onClick={() => {
                onSelect(category.categoryId);
              }}
            >
              <bdi>{getLocalizedContent(category.names, locale)}</bdi>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MenuPreviewCategories({
  merchantId,
  initialCategoryId,
  categoryId,
  expected: { sessionId, revision },
  locale,
  onSelect,
  onFailure,
}: PreviewCategoriesProps) {
  const t = useTranslations("menuPreview");
  const [categories, setCategories] = useState<MenuCategory[] | "failed">();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadItemCategoryRail({
      merchantId,
      categoryId: initialCategoryId,
      expected: { sessionId, revision },
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.kind === "ready") setCategories(result.categories);
      else if (result.kind === "error") setCategories("failed");
      else onFailure(result.kind);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, initialCategoryId, sessionId, revision, attempt, onFailure]);

  if (!categories) return <p role="status">{t("loadingCategories")}</p>;
  if (categories !== "failed") {
    return <CategoryControls {...{ categories, categoryId, locale, onSelect }} />;
  }
  return (
    <div className="menu-preview-feedback">
      <p role="alert">{t("categoriesError")}</p>
      <button
        className="menu-item-secondary"
        type="button"
        onClick={() => {
          setCategories(undefined);
          setAttempt((value) => value + 1);
        }}
      >
        {t("retry")}
      </button>
    </div>
  );
}
