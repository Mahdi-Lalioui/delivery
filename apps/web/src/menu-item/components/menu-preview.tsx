import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryRailAccessFailure } from "../item-category-rail";
import type { PreviewScope } from "../menu-preview-http";
import { useMenuPreviewPages, type OnPreviewFailure } from "../use-menu-preview-pages";
import { MenuPreviewCard } from "./menu-preview-card";
import { MenuPreviewCategories } from "./menu-preview-categories";

interface CategoryPageProps extends PreviewScope {
  categoryId: string;
  locale: Locale;
  onFailure: OnPreviewFailure;
}

function PreviewLoading({ initial }: { initial: boolean }) {
  const t = useTranslations("menuPreview");
  return (
    <>
      <p className="menu-item-hint" role="status">
        {t("loading")}
      </p>
      {initial && (
        <div className="menu-preview-cards" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <div className="menu-preview-skeleton" key={slot} />
          ))}
        </div>
      )}
    </>
  );
}

function PreviewCategoryPage({ locale, ...scope }: CategoryPageProps) {
  const t = useTranslations("menuPreview");
  const { data, pending, failed, focusItemId, loadMore } = useMenuPreviewPages(scope);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusItemId)
      content.current?.querySelector<HTMLElement>(`#menu-preview-item-${focusItemId}`)?.focus();
  }, [focusItemId]);

  return (
    <div className="menu-preview-category-page" ref={content}>
      {data && (
        <>
          <h3 className="menu-preview-category-name">
            <bdi>{getLocalizedContent(data.context.categoryNames, locale)}</bdi>
          </h3>
          {data.items.length === 0 ? (
            <p>{t("empty")}</p>
          ) : (
            <ul className="menu-preview-cards" role="list">
              {data.items.map((item) => (
                <MenuPreviewCard key={item.itemId} {...scope} locale={locale} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
      {pending && <PreviewLoading initial={data === null} />}
      {failed && (
        <p className="menu-item-error" role="alert">
          {t("loadError")}
        </p>
      )}
      {(failed || data?.nextCursor) && (
        <button className="menu-item-secondary" type="button" disabled={pending} onClick={loadMore}>
          {t(failed ? "retry" : "loadMore")}
        </button>
      )}
    </div>
  );
}

interface MenuPreviewProps extends PreviewScope {
  categoryId: string;
  locale: Locale;
  restaurantName: string | undefined;
  onAccessChanged: (failure: CategoryRailAccessFailure) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export function MenuPreview({
  categoryId,
  locale,
  restaurantName,
  onAccessChanged,
  onClose,
  onRefresh,
  ...scope
}: MenuPreviewProps) {
  const t = useTranslations("menuPreview");
  const [selectedCategory, setSelectedCategory] = useState(categoryId);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const onFailure = useCallback<OnPreviewFailure>(
    (failure) => {
      if (failure === "revision-conflict") {
        heading.current?.focus();
        setStale(true);
      } else onAccessChanged(failure);
    },
    [onAccessChanged],
  );

  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setStale(false);
      setRefreshing(false);
    }
  }

  return (
    <section className="menu-preview" aria-labelledby="menu-preview-title">
      <header className="menu-preview-hero">
        <h2 ref={heading} id="menu-preview-title" tabIndex={-1}>
          {t("title")}
        </h2>
        {restaurantName && (
          <p className="menu-preview-restaurant">
            <bdi>{restaurantName}</bdi>
          </p>
        )}
        <p className="menu-item-hint">{t("hint")}</p>
        <button className="menu-item-secondary menu-preview-quiet" type="button" onClick={onClose}>
          {t("close")}
        </button>
      </header>
      {stale ? (
        <div className="menu-preview-feedback">
          <p role="alert">{t("changed")}</p>
          <button
            className="menu-item-secondary"
            type="button"
            disabled={refreshing}
            onClick={() => {
              void refresh();
            }}
          >
            {t("refresh")}
          </button>
        </div>
      ) : (
        <div className="menu-preview-layout">
          <MenuPreviewCategories
            {...scope}
            initialCategoryId={categoryId}
            categoryId={selectedCategory}
            locale={locale}
            onSelect={setSelectedCategory}
            onFailure={onFailure}
          />
          <PreviewCategoryPage
            {...scope}
            key={selectedCategory}
            categoryId={selectedCategory}
            locale={locale}
            onFailure={onFailure}
          />
        </div>
      )}
    </section>
  );
}
