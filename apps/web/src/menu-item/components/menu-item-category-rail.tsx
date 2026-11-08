import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { MenuCategory } from "../../menu-category/menu-category-http";
import {
  loadItemCategoryRail,
  type CategoryRailAccessFailure,
  type ItemCategoryRailRequest,
} from "../item-category-rail";

const wideViewport = "(min-width: 1200px)";

function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(wideViewport);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

function isWideViewport() {
  return window.matchMedia(wideViewport).matches;
}

function serverViewport() {
  return false;
}

interface RailLinkContext {
  merchantId: string;
  categoryId: string;
  locale: Locale;
  blocked: boolean;
}

export function CategoryRailLinks({
  merchantId,
  categoryId,
  locale,
  blocked,
  categories,
}: RailLinkContext & { categories: MenuCategory[] }) {
  const translate = useTranslations("menuItem");
  const label = translate("categoryNavigation");

  return (
    <nav aria-label={label} className="menu-item-card menu-item-category-rail">
      <h2>{label}</h2>
      <ul className="menu-item-category-links" role="list">
        {categories.map((category) => {
          const name = getLocalizedContent(category.names, locale);
          const current = category.categoryId === categoryId ? "page" : undefined;
          return (
            <li key={category.categoryId}>
              {blocked ? (
                <span role="link" aria-disabled="true" aria-current={current}>
                  <bdi>{name}</bdi>
                </span>
              ) : (
                <a
                  href={`/${locale}/merchant/${merchantId}/menu/${category.categoryId}/items`}
                  aria-current={current}
                >
                  <bdi>{name}</bdi>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type Props = Pick<RailLinkContext, "locale" | "blocked"> &
  ItemCategoryRailRequest & {
    onAccessChanged: (kind: CategoryRailAccessFailure) => void;
  };

function DesktopCategoryRail({
  merchantId,
  categoryId,
  locale,
  blocked,
  expected: { sessionId, revision },
  onAccessChanged,
}: Props) {
  const [categories, setCategories] = useState<MenuCategory[] | null>(null);

  useEffect(() => {
    const request = new AbortController();
    void loadItemCategoryRail({
      merchantId,
      categoryId,
      expected: { sessionId, revision },
      signal: request.signal,
    }).then((result) => {
      if (request.signal.aborted) return;
      switch (result.kind) {
        case "ready":
          setCategories(result.categories);
          break;
        case "sign-in":
        case "forbidden":
        case "session-changed":
          onAccessChanged(result.kind);
          break;
        default:
          break;
      }
    });
    return () => {
      request.abort();
    };
  }, [merchantId, categoryId, sessionId, revision, onAccessChanged]);

  if (!categories) return null;
  return (
    <CategoryRailLinks
      merchantId={merchantId}
      categoryId={categoryId}
      locale={locale}
      categories={categories}
      blocked={blocked}
    />
  );
}

export function MenuItemCategoryRail(props: Props) {
  const isWide = useSyncExternalStore(subscribeToViewport, isWideViewport, serverViewport);
  if (!isWide) return null;
  const { merchantId, categoryId, expected } = props;
  // A different category, session, or revision starts with an empty rail.
  const key = `${merchantId}/${categoryId}/${expected.sessionId}/${String(expected.revision)}`;
  return <DesktopCategoryRail key={key} {...props} />;
}
